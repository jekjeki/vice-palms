// police.js — the VCPD. Wanted stars 1-5, cruiser pursuit with ramming,
// roadblocks at three stars, foot cops that chase and shoot, heat decay when
// the player slips out of sight, and the BUSTED / WASTED consequences.

import { CFG } from './config.js';
import { POLICE_SPEC, POLICE_SUV, DIR_ANG } from './cars.js';
import { Helicopter } from './helicopter.js';
import { clamp, dist, angMove, angNorm, TAU } from './util.js';
import { uid } from './util.js';

export class FootCop {
  constructor(x, y) {
    this.id = uid();
    this.x = x;
    this.y = y;
    this.ang = 0;
    this.hp = 60;
    this.shootT = Math.random() * 0.6;
    this.state = 'chase';    // chase | arrest | dead
    this.deadT = 0;
    this.walkPhase = 0;
    this.touchT = 0;
  }
}

export class Police {
  constructor(game) {
    this.game = game;
    this.heat = 0;
    this.wanted = 0;
    this.unseenT = 0;
    this.spawnT = 0;
    this.roadblockT = 0;
    this.roadblocks = [];      // parked cruiser pairs
    this.cops = [];            // FootCop instances
    this.busted = false;
    this.flashT = 0;
    this.sirenT = 0;
  }

  stars() { return this.wanted; }

  /** Crime reporting: raises heat, clamps, recomputes stars. */
  crime(amount, x, y) {
    const before = this.wanted;
    this.heat = clamp(this.heat + amount, 0, CFG.HEAT_MAX);
    this.updateStars();
    this.unseenT = 0;
    if (this.wanted > before) {
      this.game.audio.starUp();
      this.flashT = 1;
      if (this.game.stats) this.game.stats.bump('stars', this.wanted - before);
      // dispatch chatter grows with the stars
      if (this.game.barks && this.wanted >= 2) {
        this.game.barks.say({ id: 999999 + this.wanted, x: this.game.player.x, y: this.game.player.y - 30 },
          `DISPATCH: all units, suspect level ${this.wanted}!`, 2.4, '#8fbaff');
      }
      // scatter peds at the scene
      if (this.game.peds) this.game.peds.gunfire(x, y, 160);
    }
  }

  clear() {
    this.heat = 0;
    this.wanted = 0;
    this.unseenT = 0;
  }

  updateStars() {
    let w = 0;
    for (let i = 0; i < CFG.STAR_TABLE.length; i++) {
      if (this.heat >= CFG.STAR_TABLE[i]) w = i + 1;
    }
    this.wanted = w;
  }

  copNear(x, y, r) {
    let best = null, bd = r * r;
    for (const c of this.cops) {
      if (c.state === 'dead') continue;
      const d = (c.x - x) * (c.x - x) + (c.y - y) * (c.y - y);
      if (d < bd) { bd = d; best = c; }
    }
    return best;
  }

  touchPed(_p) { return false; }

  update(dt) {
    const game = this.game;
    this.flashT = Math.max(0, this.flashT - dt);
    if (this.wanted === 0) {
      this.decayFleet(dt);
      if (game.heli) game.heli = null;
      this.game.audio.siren(false);
      return;
    }

    const p = game.player;
    const px = p.x, py = p.y;

    // --- sight check: any cruiser or cop that can see the player?
    let seen = false;
    for (const c of game.cars) {
      if (c.driver !== 'cop' || c.dead) continue;
      const d = dist(c.x, c.y, px, py);
      if (d < 420 && game.world.lineClear(c.x, c.y, px, py)) { seen = true; break; }
      if (d < 160) { seen = true; break; }
    }
    if (!seen) {
      for (const cop of this.cops) {
        if (cop.state === 'dead') continue;
        if (dist(cop.x, cop.y, px, py) < 300 && game.world.lineClear(cop.x, cop.y, px, py)) { seen = true; break; }
      }
    }
    if (!seen && game.heli && game.heli.playerLit()) seen = true;

    if (seen) this.unseenT = 0;
    else {
      this.unseenT += dt;
      if (this.unseenT > CFG.UNSEEN_TIME) {
        this.heat = Math.max(0, this.heat - CFG.HEAT_DECAY * dt);
        this.updateStars();
        if (this.wanted === 0) {
          this.game.hud.subtitle('You lost the heat.', 2.5);
          this.decayFleet(dt, true);
        }
      }
    }

    // --- spawn pursuit cruisers
    this.spawnT -= dt;
    const wantCars = CFG.CRUISER_MAX[clamp(this.wanted, 0, 5)];
    let copCarCount = 0;
    for (const c of game.cars) {
      if (c.driver === 'cop' && !c.dead && !c.exploded) copCarCount++;
    }
    if (copCarCount < wantCars && this.spawnT <= 0) {
      this.spawnT = CFG.SPAWN_COOLDOWN;
      this.spawnCruiser(px, py);
    }

    // --- roadblocks at 3+ stars, spike strips at 5
    if (this.wanted >= CFG.ROADBLOCK_STARS) {
      this.roadblockT -= dt;
      if (this.roadblockT <= 0) {
        this.roadblockT = 14;
        this.spawnRoadblock(px, py);
      }
    }
    if (this.wanted >= 5) {
      this.spikeT = (this.spikeT === undefined ? 8 : this.spikeT) - dt;
      if (this.spikeT <= 0) {
        this.spikeT = 16;
        this.spawnSpikes(px, py);
      }
      this.updateSpikes(dt);
    } else if (game.spikes && game.spikes.length) {
      game.spikes.length = 0;
    }

    // --- the chopper lifts off at four stars and bugs out below three
    if (this.wanted >= 4 && !game.heli) {
      game.heli = new Helicopter(game);
      game.hud.subtitle('Air unit inbound — keep moving!', 3);
    } else if (this.wanted < 3 && game.heli) {
      game.heli = null;
      game.hud.subtitle('The chopper peeled off.', 2.5);
    }
    if (game.heli) game.heli.update(dt);

    // --- drive the cruisers
    for (const c of game.cars) {
      if (c.driver !== 'cop' || c.dead || c.exploded) continue;
      this.driveCop(c, dt);
      c.control(c.throttle ?? 0, c.steer ?? 0, false, dt, game.weather ? game.weather.gripMult() : 1);
      if (c.siren) {
        this.sirenT += dt;
        game.audio.siren(true, 0.5 + 0.5 * Math.sin(this.sirenT * 4));
      }
    }
    const anySiren = game.cars.some((c) => c.driver === 'cop' && !c.dead && !c.exploded && dist(c.x, c.y, px, py) < 700);
    game.audio.siren(anySiren, 0.5 + 0.5 * Math.sin(this.sirenT * 4));

    // --- foot cops: bail out of nearby cruisers when the player is on foot
    this.manageFootCops(dt);

    // --- foot cop AI
    for (const cop of this.cops) {
      if (cop.state === 'dead') { cop.deadT += dt; continue; }
      const d = dist(cop.x, cop.y, px, py);
      // chase
      const want = Math.atan2(py - cop.y, px - cop.x);
      cop.ang = angMove(cop.ang, want, 4 * dt);
      const spd = p.car ? 105 : 88;
      if (d > 26 || p.car) {
        const res = game.world.collideCircle(cop.x, cop.y, cop.x + Math.cos(cop.ang) * spd * dt, cop.y + Math.sin(cop.ang) * spd * dt, 7);
        cop.x = res.x; cop.y = res.y;
        cop.walkPhase += dt * 9;
      }
      // arrest: standing next to the player on foot
      if (!p.car && !p.dead && d < 20 && this.wanted >= 1) {
        cop.touchT += dt;
        if (cop.touchT > CFG.BUST_TIME) {
          game.onPlayerBusted();
          return;
        }
      } else cop.touchT = Math.max(0, cop.touchT - dt * 2);
      // run their mouths while chasing
      if (this.game.barks) this.game.barks.onCopChase(cop);
      // shoot at 2+ stars
      if (this.wanted >= 2 && d < CFG.COP_SHOOT_RANGE) {
        cop.shootT -= dt;
        if (cop.shootT <= 0) {
          cop.shootT = CFG.COP_SHOOT_CD * (0.8 + Math.random() * 0.5);
          if (game.world.lineClear(cop.x, cop.y, px, py)) {
            const a = want + (Math.random() - 0.5) * 0.14;
            game.bullets.push({
              x: cop.x + Math.cos(a) * 12, y: cop.y + Math.sin(a) * 12,
              dx: Math.cos(a) * CFG.GUN_SPEED * 0.85, dy: Math.sin(a) * CFG.GUN_SPEED * 0.85,
              t: 0, dur: 0.6, from: 'cop',
            });
            game.audio.gunshot();
          }
        }
      }
      // run over by the player's car
      for (const c of game.cars) {
        if (c.dead || c.driver !== 'player') continue;
        if (dist(c.x, c.y, cop.x, cop.y) < 20 && Math.abs(c.speed) > 40) {
          this.damageCop(cop, 200, game);
          game.police.crime(CFG.HEAT_COP, cop.x, cop.y);
        }
      }
    }
    this.cops = this.cops.filter((c) => c.state !== 'dead' || c.deadT < 15);
    this.cops = this.cops.filter((c) => dist(c.x, c.y, px, py) < 1200);
  }

  decayFleet(dt, all) {
    // cruisers wander off / despawn when clean
    for (const c of this.game.cars) {
      if (c.driver !== 'cop') continue;
      if (all || dist(c.x, c.y, this.game.player.x, this.game.player.y) > 900) {
        c.driver = null;
        c.parked = true;
        c.siren = false;
      }
    }
    if (all) {
      this.cops.length = 0;
      this.roadblocks.length = 0;
    }
  }

  spawnCruiser(px, py) {
    const game = this.game;
    const spot = game.world.randomLaneSpawn(this.rng(game), px, py, 900);
    if (!spot) return;
    // heavy Enforcers join the hunt at four stars and above
    const spec = this.wanted >= 4 && this.rng(game).chance(0.4) ? POLICE_SUV : POLICE_SPEC;
    const car = new (game.CarClass())(spec, spot.x, spot.y, DIR_ANG[spot.dir], {
      color: '#20242e', driver: 'cop', dir: spot.dir,
    });
    car.siren = true;
    car.speed = 120;
    game.cars.push(car);
    return car;
  }

  rng(game) {
    return game.rngPolice;
  }

  spawnRoadblock(px, py) {
    const game = this.game;
    // place two cruisers nose-to-nose across a road 600px ahead of the player
    const p = game.player;
    const ang = p.car ? p.car.ang : p.ang;
    const tx = px + Math.cos(ang) * 640;
    const ty = py + Math.sin(ang) * 640;
    // must be on a road
    if (!game.world.isRoadPx(tx, ty)) return;
    const perpendicular = ang + Math.PI / 2;
    for (const s of [-22, 22]) {
      const car = new (game.CarClass())(POLICE_SPEC,
        tx + Math.cos(perpendicular) * s, ty + Math.sin(perpendicular) * s,
        ang + Math.PI / 2 + (s > 0 ? Math.PI : 0),
        { color: '#20242e', driver: 'cop', headlights: true });
      car.siren = true;
      car.frozen = true; // holds the line until the player gets close
      game.cars.push(car);
      this.roadblocks.push(car);
      // a foot cop behind the blockade
      this.cops.push(new FootCop(tx + Math.cos(perpendicular) * (s + 14), ty + Math.sin(perpendicular) * (s + 14)));
    }
    game.hud.subtitle('Roadblock ahead!', 2.5);
  }

  /** A belt of spike strips laid across the player's road. */
  spawnSpikes(px, py) {
    const game = this.game;
    const p = game.player;
    const ang = p.car ? p.car.ang : p.ang;
    const tx = px + Math.cos(ang) * 520;
    const ty = py + Math.sin(ang) * 520;
    if (!game.world.isRoadPx(tx, ty)) return;
    if (!game.spikes) game.spikes = [];
    game.spikes.push({ x: tx, y: ty, ang: ang + Math.PI / 2, len: 96, hit: false });
    game.hud.subtitle('SPIKE STRIP ahead — swerve!', 2.5);
  }

  /** Anything rolling over the belt loses its tires; cops ride on rims too. */
  updateSpikes(dt) {
    const game = this.game;
    if (!game.spikes) game.spikes = [];
    for (const s of game.spikes) {
      for (const c of game.cars) {
        if (c.dead || c.spiked) continue;
        const dx = c.x - s.x, dy = c.y - s.y;
        const along = Math.abs(dx * Math.cos(s.ang) + dy * Math.sin(s.ang));
        const across = Math.abs(dx * -Math.sin(s.ang) + dy * Math.cos(s.ang));
        if (along < s.len / 2 && across < 18 && Math.abs(c.speed) > 20) {
          c.spiked = 3.5;
          c.speed *= 0.55;
          c.vx *= 0.6;
          c.vy *= 0.6;
          game.audio.crash(0.5);
          game.effects.push({ type: 'spark', x: c.x, y: c.y, t: 0, dur: 0.4, n: 6 });
          if (c.driver === 'player') {
            game.hud.subtitle('Tires shredded!', 2);
            game.cam.shake = Math.min(8, game.cam.shake + 5);
          }
        }
      }
      // a spiked car limps: jittery steering and capped speed
      for (const c of game.cars) {
        if (c.spiked > 0) {
          c.spiked -= dt;
          c.speed = clamp(c.speed, -c.spec.rev, c.spec.top * 0.5);
          c.ang += Math.sin(game.time * 30) * 0.02;
        }
      }
    }
    game.spikes = game.spikes.filter((s) => dist(s.x, s.y, game.player.x, game.player.y) < 1600);
  }

  /** Spike strips drawn as rows of steel teeth. */
  drawSpikes(ctx) {
    const game = this.game;
    if (!game.spikes) return;
    for (const s of game.spikes) {
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.rotate(s.ang);
      ctx.fillStyle = '#1a1d23';
      ctx.fillRect(-s.len / 2, -5, s.len, 10);
      ctx.fillStyle = '#9aa2ae';
      for (let i = 0; i < 12; i++) {
        const x = -s.len / 2 + 4 + i * (s.len - 8) / 11;
        ctx.beginPath();
        ctx.moveTo(x - 2.4, 4);
        ctx.lineTo(x, -3.4);
        ctx.lineTo(x + 2.4, 4);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    }
  }

  driveCop(car, dt) {
    const game = this.game;
    const p = game.player;
    const tx = p.car ? p.car.x : p.x;
    const ty = p.car ? p.car.y : p.y;
    const d = dist(car.x, car.y, tx, ty);
    car.frozen = false;

    // release roadblock cars only when the player is close
    if (this.roadblocks.includes(car) && d > 420) {
      car.throttle = 0; car.steer = 0;
      return;
    }

    // direct pursuit with a dash of prediction
    const lead = clamp(d / 400, 0, 1) * 0.5;
    const px = tx + (p.car ? p.car.vx * lead : 0);
    const py = ty + (p.car ? p.car.vy * lead : 0);
    const want = Math.atan2(py - car.y, px - car.x);
    const err = angNorm(want - car.ang);
    car.steer = clamp(err * 2.2, -1, 1);

    // ram throttle: full unless nearly on top of a stranded target
    let throttle = 1;
    if (d < 60 && !p.car) throttle = 0.15;
    if (Math.abs(err) > 2.2 && Math.abs(car.speed) > 100) throttle = 0.35;
    car.throttle = throttle;

    // unfreeze heading: cruisers reverse out of walls
    if (Math.abs(car.speed) < 6 && d > 80) {
      car.blockedTimer = (car.blockedTimer || 0) + dt;
      if (car.blockedTimer > 1.2) {
        car.throttle = -0.6;
        car.steer = Math.random() < 0.5 ? -1 : 1;
        if (car.blockedTimer > 2.4) car.blockedTimer = 0;
      }
    } else car.blockedTimer = 0;

    // bail cops out near the player on foot
    if (!p.car && d < 190 && car.copsOut !== true) {
      car.copsOut = true;
      car.frozen = false;
      const n = clamp(this.wanted, 1, 2);
      for (let i = 0; i < n; i++) {
        const a = car.ang + Math.PI / 2 + i * Math.PI;
        this.cops.push(new FootCop(car.x + Math.cos(a) * 20, car.y + Math.sin(a) * 20));
      }
      car.throttle = 0;
    }
  }

  manageFootCops(dt) {
    const game = this.game;
    const p = game.player;
    // cap foot cops
    let alive = 0;
    for (const c of this.cops) if (c.state !== 'dead') alive++;
    const want = clamp(this.wanted, 0, 6);
    if (alive > want + 2) {
      // send extras home
      let excess = alive - want;
      for (const c of this.cops) {
        if (excess <= 0) break;
        if (c.state !== 'dead' && dist(c.x, c.y, p.x, p.y) > 200) {
          c.state = 'dead';
          c.deadT = 14; // will be culled
          excess--;
        }
      }
    }
  }

  damageCop(cop, n, game) {
    if (cop.state === 'dead') return;
    cop.hp -= n;
    if (cop.hp <= 0) {
      cop.state = 'dead';
      cop.deadT = 0;
      if (game.stats) game.stats.bump('copsDown');
      game.effects.push({ type: 'blood', x: cop.x, y: cop.y, t: 0, dur: 0.6 });
    }
  }

  /** Bullet hit test against foot cops. */
  bulletHitCops(b, game) {
    for (const cop of this.cops) {
      if (cop.state === 'dead') continue;
      if (dist(b.x, b.y, cop.x, cop.y) < 9) {
        this.damageCop(cop, CFG.GUN_DMG * 2.2, game);
        if (cop.state === 'dead') this.crime(CFG.HEAT_COP, cop.x, cop.y);
        else this.crime(4, cop.x, cop.y);
        return true;
      }
    }
    return false;
  }
}
