// game.js — the state machine and simulation orchestrator: world + player +
// traffic + peds + police + missions, bullets, particles, respawn economy,
// and the save file. main.js only boots and drives the loop.

import { CFG } from './config.js';
import { G, clamp, dist, say, missionText, help } from './util.js';
import { World } from './world.js';
import { Car, resolveCarPairs, carVsPeds, dirAng } from './cars.js';
import { RNG as RNGClass } from './util.js';
import { Traffic } from './traffic.js';
import { Peds } from './peds.js';
import { Police } from './police.js';
import { Missions } from './missions.js';
import { Player } from './player.js';
import { Weather } from './weather.js';
import { Shops } from './shops.js';
import { Helis } from './heli.js';
import { addStat, resetStats, setMaxStars } from './stats.js';
import { hit } from './input.js';
import { setMuted, startMusic, stopMusic, engineOff, sirenOff, rainUpdate, cycleStation, stationName, sfxBoom } from './audio.js';
import { saveGame, loadSave } from './screens.js';

export class Game {
  constructor(canvas) {
    G.gameRef = this;
    this.canvas = canvas;
    G.seed = 7;
  }

  // ------------------------------------------------------------- lifecycle
  newGame(seed, opts = {}) {
    if (seed !== null && seed !== undefined) G.seed = seed;
    const s = G.seed;
    // reset the world state
    G.cars.length = 0;
    G.peds.length = 0;
    G.cops.length = 0;
    G.bullets.length = 0;
    G.parts.length = 0;
    G.skids.length = 0;
    G.booms.length = 0;
    G.t = 0;
    G.money = 350;
    G.world = new World(s);
    G.trafficMgr = new Traffic(s);
    G.pedMgr = new Peds(s);
    G.police = new Police(s);
    G.missions = new Missions(s);
    G.weather = new Weather(s);
    G.shops = new Shops(s);
    G.helis = new Helis(s);
    G.spikes.length = 0;
    G.radioName = '';
    resetStats();

    const safe = G.world.spawns.safe;
    G.player = new Player(safe.x, safe.y + 90);
    G.cam.x = G.player.x;
    G.cam.y = G.player.y;
    G.cam.z = CFG.ZOOM_FOOT;
    G.cam.shake = 0;
    G.cam.flash = 0;
    G.hud.sub = '';
    G.hud.subT = 0;
    G.hud.passed = 0;
    G.hud.help = 0;
    this.pendingEnd = false;

    // a couple of parked cars near the safehouse so the night starts warm
    const parked = [
      new Car('stallion', safe.x + 60, safe.y + 120, dirAng(0), {}),
      new Car('voodoo', safe.x + 130, safe.y + 120, dirAng(0), {}),
      new Car('cabbie', G.world.spawns.pd.x + 60, G.world.spawns.pd.y + 80, dirAng(2), {}),
    ];
    for (const p of parked) G.cars.push(p);

    // fill the parking lots and curbs with sleeping metal
    const prng = new RNGClass(s ^ 0x0a11ce);
    for (const spot of G.world.parkedCarSpots(prng)) {
      if (Math.random() < 0.25) continue;
      const type = ['stallion', 'voodoo', 'pickme', 'wagon', 'van', 'blade', 'phantom', 'cabbie'][(prng.f() * 8) | 0];
      G.cars.push(new Car(type, spot.x, spot.y, spot.h, {}));
    }

    this.setState('playing');
    if (!opts.silent) {
      say('RICO: Cousin! Find my marker — the yellow circle. We have catching up to do.', 5);
      help('Walk into the yellow RICO marker to start the story.', 6);
    }
    if (!G.muted) { initAudioIfNeeded(); startMusic(); }
  }

  continueGame() {
    const sv = loadSave();
    if (!sv) { this.newGame(null); return; }
    this.newGame(sv.seed || 7, { silent: true });
    G.money = sv.money ?? 350;
    G.t = sv.t ?? 0;
    if (G.missions) {
      G.missions.storyIdx = sv.storyIdx ?? 0;
      if (sv.sideDone) G.missions.sideDone = sv.sideDone;
    }
    if (sv.garage) G.garageData = sv.garage;
    if (sv.garage && G.shops) G.shops.garage = sv.garage;
    if (G.player) {
      G.player.x = sv.x ?? G.player.x;
      G.player.y = sv.y ?? G.player.y;
      G.player.hp = sv.hp ?? 100;
      G.player.armor = sv.armor ?? 0;
      if (sv.hasShotgun) {
        G.player.hasShotgun = true;
        G.player.weapon = sv.weapon || 'pistol';
      }
      G.player.weapons.pistol.mag = sv.pistolMag ?? 17;
      G.player.weapons.pistol.reserve = sv.pistolRes ?? 51;
      G.player.weapons.shotgun.mag = sv.sgMag ?? 0;
      G.player.weapons.shotgun.reserve = sv.sgRes ?? 0;
      G.cam.x = G.player.x;
      G.cam.y = G.player.y;
    }
    say('Save loaded. The night remembers where you left it.', 4);
  }

  toTitle() {
    engineOff();
    sirenOff();
    G.state = 'title';
  }

  setState(s) {
    G.state = s;
  }

  // ------------------------------------------------------------- outcomes
  wasted() {
    if (G.state !== 'playing') return;
    G.state = 'wasted';
    G.wastedT = 0;
    const fee = G.police ? G.police.fee(true) : 0;
    say('Hospital bill: $' + fee + '. The neon lights are not free.', 4);
    stopMusic();
  }

  busted() {
    if (G.state !== 'playing') return;
    G.state = 'busted';
    G.bustedT = 0;
    const fee = G.police ? G.police.fee(false) : 0;
    say('Bail and impound fees: $' + fee + '. Try the bus next time.', 4);
    stopMusic();
  }

  finishStory() {
    this.pendingEnd = true;
  }

  respawn() {
    const wasted = G.state === 'wasted';
    const P = G.player;
    if (P) {
      P.car = null;
      P.onFoot = true;
      P.hp = CFG.P_HP;
      P.armor = 0;
      const sp = wasted ? G.world.spawns.hospital : G.world.spawns.pd;
      P.x = sp.x;
      P.y = sp.y + 60;
    }
    if (G.police) {
      G.police.clear();
      G.police.removeUnits();
    }
    if (P) P.shield = 2.5;
    G.bullets.length = 0;
    engineOff();
    sirenOff();
    this.setState('playing');
    if (!G.muted) startMusic();
  }

  // ------------------------------------------------------------- update
  update(dt) {
    if (G.state === 'playing') {
      if (hit('Escape')) { this.setState('paused'); return; }
      if (hit('KeyM')) setMuted(!G.muted);
      if (hit('KeyP')) G.photo = !G.photo;
      if (hit('KeyN')) {
        G.radioName = cycleStation();
        help('RADIO: ' + G.radioName, 2.2);
      }
      this.simulate(dt);
    } else if (G.state === 'wasted') {
      G.wastedT += dt;
      this.effects(dt);
      if (G.wastedT > 2.8) this.respawn();
    } else if (G.state === 'busted') {
      G.bustedT += dt;
      this.effects(dt);
      if (G.bustedT > 2.8) this.respawn();
    } else if (G.state === 'title') {
      G.t += dt;
    } else if (G.state === 'end') {
      G.t += dt;
      this.effects(dt);
      if (this.pendingEnd) this.pendingEnd = false;
    }
  }

  simulate(dt) {
    G.t += dt;
    const P = G.player;
    if (!P) return;

    G.world.update(dt);
    P.update(dt);
    G.weather.update(dt);
    G.shops.update(dt);
    G.helis.update(dt);
    G.trafficMgr.update(dt);
    G.pedMgr.update(dt);
    G.police.update(dt);
    G.missions.update(dt);
    G.missions.tryGivers();
    rainUpdate(G.weather.rain);
    setMaxStars(G.police.stars);
    if (P.car) addStat('distance', P.car.speed * dt * 0.42);

    // spike strips live and bite here
    for (let i = G.spikes.length - 1; i >= 0; i--) {
      const s = G.spikes[i];
      s.life -= dt;
      if (s.life <= 0) { G.spikes.splice(i, 1); continue; }
      if (P.car && !P.car.dead && P.car.spikeT <= 0 &&
        P.car.x > s.x && P.car.x < s.x + s.w && P.car.y > s.y && P.car.y < s.y + s.h) {
        P.car.spikeT = CFG.SPIKE.slowT;
        P.car.damage(CFG.SPIKE.dmg, 'cop');
        addStat('spikesHit', 1);
        say('SPIKES! Your tires are shredding.', 2.6);
        for (let k = 0; k < 8; k++) {
          G.parts.push({ x: P.car.x, y: P.car.y, vx: (Math.random() - 0.5) * 160, vy: (Math.random() - 0.5) * 160, life: 0.4, max: 0.4, type: 'spark', r: 3 });
        }
      }
    }

    // cars not driven by traffic or police AI (player's, parked, mission)
    for (const c of G.cars) {
      const kind = c.ai ? c.ai.kind : null;
      if (kind === 'traffic' || kind === 'police' || kind === 'flee') continue;
      if (c.dead) { c.update(dt); continue; }
      if (c.driver === 'player') { c.update(dt); continue; }
      // parked: sleep unless near camera
      if (dist(c.x, c.y, G.cam.x, G.cam.y) < 1200) c.update(dt);
    }
    // rival flee AI from missions
    for (const c of G.cars) {
      if (c.ai && c.ai.kind === 'flee' && !c.dead && !c.driver) {
        G.missions.driveFlee(c, dt);
        c.update(dt);
      }
    }

    resolveCarPairs(G.cars, dt);
    if (P.car) carVsPeds(P.car, G.peds, dt);
    for (const c of G.cars) {
      if (c.type === 'police' && c.driver === 'police') carVsPeds(c, G.peds, dt);
    }

    // bullets vs police helicopters
    for (const h of G.helis.list) {
      if (h.gone || h.dead || h.leave) continue;
      for (let i = G.bullets.length - 1; i >= 0; i--) {
        const b = G.bullets[i];
        if (b.from !== 'player') continue;
        if (dist(b.x, b.y, h.x, h.y) < 30) {
          h.hurt(11, 'player');
          G.parts.push({ x: b.x, y: b.y, vx: 0, vy: 0, life: 0.15, max: 0.15, type: 'spark', r: 3 });
          G.bullets.splice(i, 1);
        }
      }
    }

    // chain-reaction at the fuel station pumps
    for (const b of G.booms) {
      if (b.t > 0.12) continue;
      const pump = G.world.fuelPumps;
      if (pump && !pump.boom && dist(b.x, b.y, pump.x, pump.y) < 150) {
        pump.boom = G.t;
        G.booms.push({ x: pump.x, y: pump.y, t: 0, r: 200 });
        G.cam.shake = Math.min(22, G.cam.shake + 16);
        sfxBoom(1.4);
        for (const c of G.cars) {
          if (!c.dead && dist(c.x, c.y, pump.x, pump.y) < 190) c.damage(120, 'other');
        }
        if (!P.car && dist(P.x, P.y, pump.x, pump.y) < 160) P.hurt(65, 'boom');
      }
    }

    this.bullets(dt);
    this.effects(dt);

    // run-over panic
    if (P.car && P.car.speed > 110) G.pedMgr.panicAt(P.x, P.y, 190);
  }

  bullets(dt) {
    const P = G.player;
    for (let i = G.bullets.length - 1; i >= 0; i--) {
      const b = G.bullets[i];
      const steps = 2;
      let hitSomething = false;
      for (let k = 0; k < steps && !hitSomething; k++) {
        b.x += (b.vx * dt) / steps;
        b.y += (b.vy * dt) / steps;
        // world
        const r = G.world.collide(b.x, b.y, 2);
        if (r.power > 0.4) {
          G.parts.push({ x: b.x, y: b.y, vx: 0, vy: 0, life: 0.15, max: 0.15, type: 'spark', r: 3 });
          hitSomething = true;
          break;
        }
        // peds
        for (const p of G.peds) {
          if (p.state === 'dead') continue;
          if (dist(b.x, b.y, p.x, p.y) < 8) {
            p.kill();
            G.parts.push({ x: p.x, y: p.y, vx: 0, vy: 0, life: 0.4, max: 0.4, type: 'blood', r: 5 });
            if (b.from === 'player' && G.police) G.police.crime(2, p.x, p.y);
            G.pedMgr.panicAt(p.x, p.y, 260);
            hitSomething = true;
            break;
          }
        }
        if (hitSomething) break;
        // cops
        for (const cop of G.cops) {
          if (cop.hp <= 0) continue;
          if (dist(b.x, b.y, cop.x, cop.y) < 8) {
            cop.hp -= (b.dmg || 12) * 2.5;
            G.parts.push({ x: cop.x, y: cop.y, vx: 0, vy: 0, life: 0.4, max: 0.4, type: 'blood', r: 4 });
            hitSomething = true;
            break;
          }
        }
        if (hitSomething) break;
        // cars
        for (const c of G.cars) {
          if (c.dead && c.wreckT > 2) continue;
          if (c.driver === 'player' && b.from === 'player') continue;
          if (dist(b.x, b.y, c.x, c.y) < c.r) {
            c.damage(b.dmg || 12, b.from === 'player' ? 'player' : 'cop');
            G.parts.push({ x: b.x, y: b.y, vx: 0, vy: 0, life: 0.15, max: 0.15, type: 'spark', r: 3 });
            hitSomething = true;
            break;
          }
        }
        if (hitSomething) break;
        // the player
        if (b.from === 'cop' && P && dist(b.x, b.y, P.x, P.y) < 9) {
          P.hurt(9, 'cop');
          G.parts.push({ x: P.x, y: P.y, vx: 0, vy: 0, life: 0.3, max: 0.3, type: 'blood', r: 4 });
          hitSomething = true;
        }
      }
      b.life -= dt;
      if (hitSomething || b.life <= 0 || b.x < 0 || b.y < 0 || b.x > CFG.W || b.y > CFG.H) {
        G.bullets.splice(i, 1);
      }
    }
  }

  effects(dt) {
    // particles
    for (let i = G.parts.length - 1; i >= 0; i--) {
      const p = G.parts[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 1 - dt * 1.6;
      p.vy *= 1 - dt * 1.6;
      if (p.type === 'smoke') p.vy -= dt * 14;
      p.life -= dt;
      if (p.life <= 0) G.parts.splice(i, 1);
    }
    if (G.parts.length > CFG.PART_MAX) G.parts.splice(0, G.parts.length - CFG.PART_MAX);
    // skids
    if (G.skids.length > CFG.SKID_MAX) G.skids.splice(0, G.skids.length - CFG.SKID_MAX);
    // hud timers
    G.hud.subT -= dt;
    G.hud.missionT -= dt;
    G.hud.help -= dt;
    if (G.hud.cut) {
      G.hud.cut.t -= dt;
      if (G.hud.cut.t <= 0) G.hud.cut = null;
    }
    if (G.hud.passed > 0) {
      G.hud.passed -= dt;
      if (G.hud.passed <= 0 && this.pendingEnd) {
        this.pendingEnd = false;
        stopMusic();
        this.setState('end');
      }
    }
    // panic the streets around gunfights handled at shot origin
  }
}

// audio bootstrap used after a gesture — screens.js owns the gesture hook,
// but a fresh game started from Enter also counts as one.
import { initAudio } from './audio.js';
function initAudioIfNeeded() { initAudio(); }
