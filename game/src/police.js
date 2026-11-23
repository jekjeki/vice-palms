// ---------------------------------------------------------------------------
// police.js — the heat. Wanted level 1..5, crime memory, cruiser pursuit with
// ramming, foot cops that shoot, roadblocks at 3+ stars, out-of-sight decay,
// BUSTED and WASTED resolution with respawn fees.
// ---------------------------------------------------------------------------

import { CFG } from './config.js';
import { Car } from './cars.js';
import { Helis } from './heli.js';
import { clamp, dist2, wrapAngle, angleDamp } from './util.js';

const STAR_HEAT = CFG.HEAT_PER_STAR;

export class Cop {
  constructor(x, y, rng) {
    this.x = x; this.y = y;
    this.angle = 0;
    this.hp = 70;
    // rookies spray, veterans walk their shots in
    this.skill = rng.chance(0.3) ? 1.6 : 0.8;
    this.name = rng.chance(0.3) ? 'rookie' : 'veteran';
    this.fireCd = rng.range(0.4, 1.0);
    this.state = 'chase';      // chase | hold
    this.walkPhase = 0;
    this.skin = '#c8a080';
    this.shirt = '#22348c';
    this.pants = '#1c2440';
  }

  update(dt, game) {
    const p = game.player;
    const d = Math.hypot(p.x - this.x, p.y - this.y);
    const seen = !game.world.sightBlocked(this.x, this.y, p.x, p.y);
    let want = 0;
    if (this.sprint) want = 165;   // beacon-lit sprint to the bust
    if (d > 190 || !seen) {
      // pursue the player's position (last known if unseen)
      const a = Math.atan2(p.y - this.y, p.x - this.x);
      this.angle = angleDamp(this.angle, a, 8, dt);
      want = 118;
    } else if (d > 120) {
      const a = Math.atan2(p.y - this.y, p.x - this.x);
      this.angle = angleDamp(this.angle, a, 8, dt);
      want = 90;
    } else {
      const a = Math.atan2(p.y - this.y, p.x - this.x);
      this.angle = angleDamp(this.angle, a, 10, dt);
    }
    const nx = this.x + Math.cos(this.angle) * want * dt;
    const ny = this.y + Math.sin(this.angle) * want * dt;
    const fixed = game.world.collide(nx, ny, 9);
    if (fixed) { this.x = fixed.x; this.y = fixed.y; } else { this.x = nx; this.y = ny; }
    this.walkPhase += dt * want * 0.12;

    // shoot when close-ish and line of sight
    this.fireCd -= dt;
    if (this.fireCd <= 0 && d < 340 && seen) {
      this.fireCd = game.rng.range(0.5, 1.1);
      const spread = 0.07 * this.skill;
      const a = Math.atan2(p.y - this.y, p.x - this.x) + game.rng.range(-spread, spread);
      game.fx.muzzleFlash(this.x + Math.cos(a) * 14, this.y + Math.sin(a) * 14, a);
      game.fx.casing(this.x, this.y);
      game.audio.gunshot();
      game.bullet(this.x, this.y, a, { from: 'cop', dmgPed: 0, dmgCar: 6, dmgPlayer: 9, range: 360 });
    }
  }
}

export class Police {
  constructor(worldRef, rng) {
    this.world = worldRef;
    this.rng = rng;
    this.heat = 0;             // 0..150ish
    this.wanted = 0;
    this.unseenT = 0;
    this.cruisers = [];
    this.cops = [];
    this.roadblocks = [];      // parked cruisers + cones
    this.spawnCd = 0;
    this.blockCd = 0;
    this.bustT = 0;
    this.sirenOn = false;
    this.helis = new Helis(rng);
    this.starAge = 99;         // seconds since wanted level changed
  }

  /** rolling event log (shown in the HUD) */
  log(text) {
    if (!this._log) this._log = [];
    this._log.unshift({ text, t: 4 });
    this._log.length = Math.min(this._log.length, 4);
  }

  tickLog(dt) {
    if (!this._log) return;
    for (let i = this._log.length - 1; i >= 0; i--) {
      this._log[i].t -= dt;
      if (this._log[i].t <= 0) this._log.splice(i, 1);
    }
  }

  reset() {
    this.heat = 0;
    this.wanted = 0;
    this.unseenT = 0;
    this.cruisers.length = 0;
    this.cops.length = 0;
    this.roadblocks.length = 0;
    this.spawnCd = 0;
    this.blockCd = 0;
    this.bustT = 0;
    this.sirenOn = false;
    this.destroyedCruisers = 0;
    this.helis.list.length = 0;
    this.helis.spawnCd = 0;
  }

  /** the helicopter beam or any direct sighting refreshes pursuit */
  spotted() {
    this.unseenT = 0;
  }

  crime(x, y, points, kind) {
    if (points <= 0) return;
    this.heat += points;
    this.unseenT = 0;
    this.updateWanted();
    if (this.wanted !== this._lastWanted) {
      this.starAge = 0;
      this._lastWanted = this.wanted;
      if (this.wanted > 0) this.log(`Wanted level ${this.wanted} — ${kind || 'crime'}`);
    }
  }

  /** shots fired near witnesses — small heat, big if cops nearby */
  gunfireHeard(x, y) {
    for (const c of this.cops) {
      if (dist2(c.x, c.y, x, y) < 260 * 260) { this.crime(x, y, 8, 'shotatcop'); return; }
    }
    for (const c of this.cruisers) {
      if (dist2(c.x, c.y, x, y) < 260 * 260) { this.crime(x, y, 8, 'shotatcop'); return; }
    }
    this.crime(x, y, 2.5, 'shots');
  }

  updateWanted() {
    this.wanted = clamp(Math.floor(this.heat / STAR_HEAT), 0, CFG.WANTED_MAX);
  }

  starCount() { return this.wanted; }

  update(dt, game) {
    const p = game.player;
    this.starAge = (this.starAge || 99) + dt;
    this.tickLog(dt);
    if (this.wanted <= 0) {
      this.sirens(game, false);
      this.decayClean(dt, game);
      this.helis.update(dt, game);   // handles despawn + rotor off
      return;
    }

    // ---- sight & decay
    const seen = this.anyCruiserSees(game) || this.anyCopSees(game);
    this.helis.update(dt, game);     // beam sightings call spotted()
    if (seen) this.unseenT = 0;
    else {
      this.unseenT += dt;
      if (this.unseenT > CFG.SIGHT_TIME) {
        this.heat = Math.max(0, this.heat - CFG.HEAT_DECAY * dt * 2);
        this.updateWanted();
      }
    }

    // ---- spawn response matching the stars
    this.spawnCd -= dt;
    const wantCruisers = this.wanted;
    if (this.spawnCd <= 0 && this.activeCruisers() < wantCruisers) {
      this.spawnCd = 3.2;
      this.spawnCruiser(game);
    }
    // foot cops deploy when the player is on foot or stopped
    if (this.wanted >= 2 && this.cops.length < Math.min(4, this.wanted) && (this.cruisers.length === 0 || !p.inCar)) {
      this.deployFootCop(game);
    }

    // ---- roadblocks at 3+
    this.blockCd -= dt;
    if (this.wanted >= 3 && this.blockCd <= 0 && p.inCar && Math.abs(p.inCar.speed) > 140) {
      this.blockCd = 16;
      this.tryRoadblock(game);
    }

    // ---- cruisers
    this.updateRoadblocks(dt);
    for (let i = this.cruisers.length - 1; i >= 0; i--) {
      const c = this.cruisers[i];
      if (c.wrecked) {
        c.burnUpdate = (c.burnTimer || 10) - dt;
        if (c.wreckTimer !== undefined) { /* traffic-style linger handled here */ }
        c.wreckTimer = (c.wreckTimer || 14) - dt;
        if (c.wreckTimer <= 0) this.cruisers.splice(i, 1);
        continue;
      }
      this.driveCruiser(c, dt, game);
      // crew bails out when the cruiser is burning or the player is on foot & close
      if (c.hp < c.maxHp * 0.55 && !c.bailed) { c.bailed = true; this.bailCrew(c, game); }
      if (!p.inCar && dist2(c.x, c.y, p.x, p.y) < 200 * 200 && Math.abs(c.speed) < 30 && c.crew > 0) {
        c.bailed = true; this.bailCrew(c, game);
      }
    }

    // foot cops sprint when the air unit has the player lit
    const heliLit = this.helis.list.some((h) => h.lit);
    for (const cop of this.cops) {
      if (heliLit) cop.sprint = true;
      else if (cop.sprint && this.rng.chance(dt * 0.5)) cop.sprint = false;
    }

    // ---- foot cops
    for (let i = this.cops.length - 1; i >= 0; i--) {
      const cop = this.cops[i];
      cop.update(dt, game);
      if (cop.hp <= 0) {
        game.fx.blood(cop.x, cop.y, 14);
        this.cops.splice(i, 1);
        continue;
      }
      // BUSTED check: cop adjacent to on-foot player (or player parked)
      if (!p.dead) {
        const near = dist2(cop.x, cop.y, p.x, p.y) < CFG.BUST_DIST * CFG.BUST_DIST;
        const still = !p.inCar || Math.abs(p.inCar.speed) < 8;
        if (near && still) {
          this.bustT += dt;
          cop.arresting = true;
          if (this.bustT > CFG.BUST_TIME) { game.onBusted(); return; }
        } else {
          cop.arresting = false;
        }
      }
    }
    if (this.cops.length === 0) this.bustT = Math.max(0, this.bustT - dt);

    this.sirens(game, this.activeCruisers() > 0);
  }

  decayClean(dt, game) {
    // even at zero heat, lingering cops wander off
    for (let i = this.cops.length - 1; i >= 0; i--) {
      const c = this.cops[i];
      const p = game.player;
      const a = Math.atan2(c.y - p.y, c.x - p.x);
      c.x += Math.cos(a) * 60 * dt;
      c.y += Math.sin(a) * 60 * dt;
      if (dist2(c.x, c.y, p.x, p.y) > 700 * 700) this.cops.splice(i, 1);
    }
    for (let i = this.cruisers.length - 1; i >= 0; i--) {
      const c = this.cruisers[i];
      if (!c.wrecked && !c.missionTag) {
        c.speed *= 0.94;
        if (dist2(c.x, c.y, game.player.x, game.player.y) > 900 * 900) this.cruisers.splice(i, 1);
      }
    }
  }

  sirens(game, on) {
    if (on !== this.sirenOn) {
      this.sirenOn = on;
      game.audio.siren(on);
    }
  }

  activeCruisers() {
    let n = 0;
    for (const c of this.cruisers) if (!c.wrecked) n++;
    return n;
  }

  anyCruiserSees(game) {
    const p = game.player;
    for (const c of this.cruisers) {
      if (c.wrecked) continue;
      if (dist2(c.x, c.y, p.x, p.y) < 460 * 460 && !this.world.sightBlocked(c.x, c.y, p.x, p.y)) return true;
    }
    return false;
  }

  anyCopSees(game) {
    const p = game.player;
    for (const c of this.cops) {
      if (dist2(c.x, c.y, p.x, p.y) < 400 * 400 && !this.world.sightBlocked(c.x, c.y, p.x, p.y)) return true;
    }
    return false;
  }

  spawnCruiser(game) {
    const p = game.player;
    if (this.rng.chance(0.2)) game.toast('DISPATCH: all units, code ' + (2 + this.rng.int(0, 4)) + ' downtown!');
    // spawn on a road ~700-1100px away, prefer ahead of the player's travel
    for (let t = 0; t < 20; t++) {
      const pt = this.world.nearestRoadPoint(
        p.x + this.rng.range(-1100, 1100),
        p.y + this.rng.range(-1100, 1100),
      );
      if (!pt) continue;
      const d = Math.hypot(pt.x - p.x, pt.y - p.y);
      if (d < 640 || d > 1200) continue;
      if (this.world.isWater(pt.x, pt.y)) continue;
      const seg = pt.seg;
      const ang = seg.axis === 'v' ? Math.PI / 2 : 0;
      const car = new Car('police', pt.x, pt.y, ang);
      car.driver = 'cop';
      car.crew = 2;
      car.siren = true;
      car.cruise = 300 + this.wanted * 18;
      this.cruisers.push(car);
      return car;
    }
    return null;
  }

  driveCruiser(c, dt, game) {
    const p = game.player;
    const tx = p.x, ty = p.y;
    const desired = Math.atan2(ty - c.y, tx - c.x);
    const diff = wrapAngle(desired - c.angle);
    let steer = clamp(diff * 2.2, -1, 1);
    let throttle = 1;
    const d = Math.hypot(tx - c.x, ty - c.y);
    if (d < 90 && Math.abs(diff) > 1.2) throttle = -0.4;      // reposition
    if (d < 46) throttle = 0;                                  // stay on them
    const handbrake = Math.abs(diff) > 1.5 && Math.abs(c.speed) > 160;

    // PIT attempt: alongside the player's car at speed → snap into them
    const pc = p.inCar;
    if (pc && !pc.wrecked && this.wanted >= 2) {
      const alongside = Math.abs(Math.cos(c.angle - pc.angle)) > 0.75;
      const lateral = Math.abs(-Math.sin(c.angle) * (pc.x - c.x) + Math.cos(c.angle) * (pc.y - c.y));
      if (alongside && lateral < 40 && d < 70 && Math.abs(c.speed) > 180) {
        steer = clamp(steer + (Math.sin(c.angle) * (pc.y - c.y) - Math.cos(c.angle) * (pc.x - c.x)) > 0 ? -0.9 : 0.9, -1, 1);
        throttle = 1;
      }
    }

    if (c.isStuck(dt)) { c.unstuckStep(dt); return; }
    c.step(dt, { throttle, steer, handbrake, grip: game.weather.gripMult() }, this.world);
    c.collideWorld(this.world);
    // ram damage to the player's car is resolved by collideCars in game.js
    if (game.rng.chance(dt * 0.4)) {
      // cops occasionally leap out to shoot from the cruiser at 2+ stars
      if (this.wanted >= 2 && d < 240 && !p.inCar && c.crew > 0) {
        c.bailed = true; this.bailCrew(c, game);
      }
    }
  }

  bailCrew(c, game) {
    const n = Math.min(c.crew || 1, 2);
    for (let i = 0; i < n; i++) {
      const side = c.angle + (i === 0 ? Math.PI / 2 : -Math.PI / 2);
      const x = c.x + Math.cos(side) * 24, y = c.y + Math.sin(side) * 24;
      const fixed = this.world.collide(x, y, 9);
      const cop = new Cop(fixed ? fixed.x : x, fixed ? fixed.y : y, this.rng);
      this.cops.push(cop);
    }
    c.crew = 0;
  }

  deployFootCop(game) {
    const p = game.player;
    for (let t = 0; t < 12; t++) {
      const a = this.rng.range(-Math.PI, Math.PI);
      const d = this.rng.range(420, 640);
      const x = p.x + Math.cos(a) * d, y = p.y + Math.sin(a) * d;
      if (this.world.solidHit(x, y, 10) || this.world.isWater(x, y)) continue;
      this.cops.push(new Cop(x, y, this.rng));
      return;
    }
  }

  // ------------------------------------------------------------ roadblocks
  /** spawn two cruisers across the road ahead of the player + cones */
  tryRoadblock(game) {
    const p = game.player;
    if (!p.inCar) return;
    const car = p.inCar;
    const ahead = { x: car.x + Math.cos(car.angle) * 760, y: car.y + Math.sin(car.angle) * 760 };
    const pt = this.world.nearestRoadPoint(ahead.x, ahead.y);
    if (!pt || Math.hypot(pt.x - ahead.x, pt.y - ahead.y) > 260) return;
    const seg = pt.seg;
    const across = seg.axis === 'v' ? 0 : Math.PI / 2;
    const offs = [-22, 22];
    for (const o of offs) {
      const cx = seg.axis === 'v' ? pt.x + o : pt.x;
      const cy = seg.axis === 'v' ? pt.y : pt.y + o;
      if (this.world.isWater(cx, cy)) continue;
      const b = new Car('police', cx, cy, across + Math.PI / 2);
      b.parked = true;
      b.crew = 2;
      b.siren = true;
      b.lightsOn = true;
      b.roadblock = true;
      this.cruisers.push(b);
      // cones flanking each cruiser
      const perp = seg.axis === 'v' ? { x: 0, y: 1 } : { x: 1, y: 0 };
      for (const s of [-1, 1]) {
        this.roadblocks.push({
          x: cx + perp.x * s * 34, y: cy + perp.y * s * 34,
          kind: 'cone', t: 24,
        });
      }
    }
    // a couple of cops behind the cruisers
    for (let i = 0; i < 2; i++) {
      const back = 60 + i * 40;
      const cx = seg.axis === 'v' ? pt.x : pt.x - back;
      const cy = seg.axis === 'v' ? pt.y - back : pt.y;
      if (!this.world.solidHit(cx, cy, 10)) this.cops.push(new Cop(cx, cy, this.rng));
    }
    game.toast('Roadblock ahead!');
  }

  /** fade cones out when their moment passes */
  updateRoadblocks(dt) {
    for (let i = this.roadblocks.length - 1; i >= 0; i--) {
      const c = this.roadblocks[i];
      c.t -= dt;
      if (c.t <= 0) this.roadblocks.splice(i, 1);
    }
  }

  /** explosions notify the police force (destroyed cruiser heat etc.) */
  onCarDestroyed(car, game) {
    if (car.type === 'police') {
      this.destroyedCruisers = (this.destroyedCruisers || 0) + 1;
      this.crime(car.x, car.y, 35, 'copcar');
    } else {
      this.crime(car.x, car.y, 12, 'vandalism');
    }
  }

  clearHeat() {
    this.heat = 0;
    this.wanted = 0;
    this.unseenT = 0;
    this.destroyedCruisers = 0;
  }
}
