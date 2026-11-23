// ---------------------------------------------------------------------------
// peds.js — pedestrians. Wander sidewalks, cross roads, panic at gunfire and
// near speeding cars, flee burning vehicles and report crimes (raising heat).
// ---------------------------------------------------------------------------

import { CFG } from './config.js';
import { RNG } from './rng.js';
import { clamp, dist2, wrapAngle, angleDamp } from './util.js';

const SKINS = ['#c8a080', '#8a6248', '#6e4a34', '#d8b090', '#a87858'];
const SHIRTS = ['#8a4a4a', '#4a6a8a', '#6a8a4a', '#8a7a4a', '#7a4a8a', '#4a8a7a', '#9a9a9a', '#3d4a5a'];
const PANTS = ['#2e3440', '#3d3a2e', '#4a3d4a', '#26323c'];

// things people shout when the night goes sideways
const BARKS = [
  '¡Ay, dios mío!', 'He\'s got a gun!', 'Call 911!', 'Not again…',
  'Run!', 'Somebody help!', 'My taxi money!', 'This city, man…',
  '¡Qué locura!', 'Not the shoes!', 'I saw nothing!', 'Meredith, RUN!',
];

// calm-chatter lines (rare, adds life)
const CHATTER = [
  '…and I said no way.', 'Fresh mangos, two bucks.', 'The pier? Ha.',
  'This heat is unnatural.', 'Did you see the game?', 'Mangos are UP, I tell you.',
  '…so the flamingo walks in…', 'Six blocks for a cafecito.',
];

export class Ped {
  constructor(x, y, rng) {
    this.x = x;
    this.y = y;
    this.angle = rng.range(-Math.PI, Math.PI);
    this.speed = 0;
    this.state = 'walk';        // walk | idle | flee | dead
    // street types: strollers amble, walkers wander, joggers hustle the sand
    const roll = rng.next();
    this.kind = roll < 0.15 ? 'jogger' : roll < 0.25 ? 'dogwalker' : 'walker';
    this.hp = 100;
    this.skin = rng.pick(SKINS);
    this.shirt = rng.pick(SHIRTS);
    this.pants = rng.pick(PANTS);
    this.target = { x, y };
    this.idleT = rng.range(0, 3);
    this.panicT = 0;
    this.panicFrom = { x, y };
    this.deadT = 0;
    this.walkPhase = rng.range(0, 10);
    this.reported = false;
    this.staggerT = 0;
    this.staggerX = 0;
    this.staggerY = 0;
  }

  update(dt, game) {
    if (this.state === 'dead') {
      this.deadT += dt;
      return;
    }
    // shot peds stagger before running
    if (this.staggerT > 0) {
      this.staggerT -= dt;
      this.speed = 0;
      this.x += (this.staggerX || 0) * dt * 30;
      this.y += (this.staggerY || 0) * dt * 30;
      return;
    }
    const W = this.world(game);
    const speed = this.state === 'flee' ? CFG.PED_FLEE
      : this.kind === 'stroller' ? CFG.PED_WALK * 0.6
      : this.kind === 'sunbather' ? 0
      : this.kind === 'jogger' ? CFG.PED_WALK * 2.1
      : CFG.PED_WALK;

    if (this.state === 'flee') {
      this.panicT -= dt;
      const dx = this.x - this.panicFrom.x, dy = this.y - this.panicFrom.y;
      const d = Math.hypot(dx, dy) || 1;
      this.angle = angleDamp(this.angle, Math.atan2(dy, dx), 8, dt);
      if (this.panicT <= 0) this.state = 'walk';
    } else {
      // wander toward target, pick a new one on arrival
      const dx = this.target.x - this.x, dy = this.target.y - this.y;
      const d = Math.hypot(dx, dy);
      if (d < 14 || (this.idleT -= dt) <= 0) {
        this.idleT = game.rng.range(2, this.kind === 'jogger' ? 1 : 7);
        const p = this.kind === 'dogwalker'
          ? this.world(game).randomSidewalkPoint(game.rng)
          : game.world.randomSidewalkPoint(game.rng);
        this.target = p;
        // rare idle chatter
        if (game.rng.chance(0.06)) {
          game.fx.text(this.x, this.y - 18, game.rng.pick(CHATTER), 'rgba(225,225,215,0.8)');
        }
      }
      if (d >= 14) this.angle = angleDamp(this.angle, Math.atan2(dy, dx), 6, dt);
    }

    this.speed = this.state === 'idle' ? 0 : speed;
    if (this.speed > 0) {
      const nx = this.x + Math.cos(this.angle) * this.speed * dt;
      const ny = this.y + Math.sin(this.angle) * this.speed * dt;
      const fixed = W.collide(nx, ny, CFG.PED_R);
      if (fixed) {
        this.x = fixed.x; this.y = fixed.y;
        if (this.state === 'walk') {
          // blocked → new target soon
          this.idleT = Math.min(this.idleT, 0.2);
          this.angle += game.rng.range(-1.4, 1.4);
        } else {
          this.angle += game.rng.range(-0.7, 0.7);
        }
      } else {
        this.x = nx; this.y = ny;
      }
    }
    this.walkPhase += dt * this.speed * 0.12;
  }

  world(game) { return game.world; }

  panic(x, y, game) {
    if (this.state === 'dead') return;
    const wasCalm = this.state !== 'flee';
    this.state = 'flee';
    this.panicT = game.rng.range(3, 6);
    this.panicFrom = { x, y };
    if (wasCalm && game.rng.chance(0.25)) {
      game.fx.text(this.x, this.y - 20, game.rng.pick(BARKS), '#e8e0d0');
    }
    // screaming for help raises heat once per ped
    if (!this.reported && dist2(x, y, this.x, this.y) < 300 * 300) {
      this.reported = true;
      game.police.crime(this.x, this.y, 1.5, 'panic');
    }
  }

  hurt(dmg, fromX, fromY, game) {
    if (this.state === 'dead') return false;
    this.hp -= dmg;
    // stagger first, then flee
    const a = Math.atan2(this.y - fromY, this.x - fromX);
    this.staggerT = 0.22;
    this.staggerX = Math.cos(a);
    this.staggerY = Math.sin(a);
    this.panic(fromX, fromY, game);
    game.fx.blood(this.x, this.y, 6);
    if (this.hp <= 0) {
      this.state = 'dead';
      this.deadT = 0;
      game.fx.blood(this.x, this.y, 14);
      game.police.crime(this.x, this.y, 30, 'murder');
      return true;
    }
    game.police.crime(this.x, this.y, 6, 'assault');
    return false;
  }

  runOver(car, game) {
    if (this.state === 'dead') return false;
    if (car.speed < 60) return false;
    this.state = 'dead';
    this.deadT = 0;
    this.x += Math.cos(car.angle) * 14;
    this.y += Math.sin(car.angle) * 14;
    game.fx.blood(this.x, this.y, 18);
    game.police.crime(this.x, this.y, 40, 'vehicular');
    game.audio.hurt();
    return true;
  }
}

export class Peds {
  constructor(worldRef, rng) {
    this.world = worldRef;
    this.rng = rng;
    this.list = [];
    this.spawnTimer = 0;
  }

  update(dt, game) {
    const player = game.player;
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0 && this.list.length < CFG.PEDS_TARGET) {
      this.spawnTimer = 0.3;
      this.trySpawn(game);
    }
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      p.update(dt, game);
      // car proximity check (run over)
      const car = player.inCar;
      if (car && !car.wrecked && p.state !== 'dead') {
        if (dist2(p.x, p.y, car.x, car.y) < (car.radius + 6) ** 2 && car.containsPoint(p.x, p.y)) {
          p.runOver(car, game);
        } else if (car.speed > 180 && dist2(p.x, p.y, car.x, car.y) < 120 * 120) {
          p.panic(car.x, car.y, game);
        }
      }
      if (p.state === 'dead' && p.deadT > 25) this.list.splice(i, 1);
      else if (p.state !== 'dead') {
        const d2 = dist2(p.x, p.y, player.x, player.y);
        if (d2 > CFG.PED_CULL_R * CFG.PED_CULL_R) this.list.splice(i, 1);
      }
    }
  }

  trySpawn(game) {
    const player = game.player;
    for (let t = 0; t < 10; t++) {
      const pt = this.world.randomSidewalkPoint(this.rng);
      const d2 = dist2(pt.x, pt.y, player.x, player.y);
      if (d2 < 260 * 260 || d2 > CFG.PED_SPAWN_R * CFG.PED_SPAWN_R) continue;
      if (this.world.solidHit(pt.x, pt.y, CFG.PED_R + 2)) continue;
      const ped = new Ped(pt.x, pt.y, this.rng);
      // beach strollers: slower, pastel, toes in the sand
      const onSand = pt.y < CFG.SAND_N1 || pt.x > CFG.SAND_E0 || pt.y > 3925;
      if (onSand) {
        ped.kind = 'stroller';
        ped.shirt = this.rng.pick(['#e8c8d8', '#c8e0e8', '#e8e0c0', '#d0e8c8']);
        if (this.rng.chance(0.4)) ped.kind = 'sunbather';
      }
      this.list.push(ped);
      return;
    }
  }

  panicNear(x, y, r, game) {
    for (const p of this.list) {
      if (p.state === 'dead') continue;
      if (dist2(p.x, p.y, x, y) < r * r) p.panic(x, y, game);
    }
  }

  /** kick a carjacked driver onto the street, screaming */
  spawnFleeingDriver(car) {
    const p = new Ped(car.x + Math.cos(car.angle + Math.PI / 2) * 26, car.y + Math.sin(car.angle + Math.PI / 2) * 26, this.rng);
    p.state = 'flee';
    p.panicT = 5;
    p.panicFrom = { x: car.x, y: car.y };
    p.reported = true; // jacking heat already handled by the car
    this.list.push(p);
    return p;
  }

  aliveCount() {
    let n = 0;
    for (const p of this.list) if (p.state !== 'dead') n++;
    return n;
  }
}
