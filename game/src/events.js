// events.js — ambient city events: gang drive-bys, street racers, beach
// crowds, busker clusters. Keeps the city alive between missions.

import { CFG, ctx } from './config.js';
import { clamp, dist, TAU } from './util.js';
import { makeCar } from './cars.js';
import { nearestRoadPoint, zoneAt } from './world.js';

export class Events {
  constructor() {
    this.timer = 16 + Math.random() * 14;
    this.lastKind = '';
    this.active = [];        // {kind, x, y, t}
  }

  update(dt, S) {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const e = this.active[i];
      e.t -= dt;
      if (e.t <= 0) this.active.splice(i, 1);
    }

    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = 26 + Math.random() * 30;

    const p = S.player;
    const roll = Math.random();
    const kind = roll < 0.28 ? 'driveby' : roll < 0.5 ? 'racers' : roll < 0.68 ? 'crowd'
      : roll < 0.82 ? 'beachparty' : roll < 0.92 ? 'copsweep' : 'drunk';
    if (kind === this.lastKind && Math.random() < 0.6) return;
    this.lastKind = kind;

    switch (kind) {
      case 'driveby': {
        // a gang sedan pulls up ahead; the crew hops out and hunts
        if (ctx.police.level >= 3) return;      // don't stack chaos on chaos
        const pt = nearestRoadPoint(ctx.world, p.x + (Math.random() - 0.5) * 900, p.y + (Math.random() - 0.5) * 700);
        const dz = dist(pt.x, pt.y, p.x, p.y);
        if (dz < 260 || dz > 900) return;
        const zone = zoneAt(pt.x, pt.y);
        if (zone === 'water' || zone === 'park' || zone === 'airfield') return;
        const car = makeCar('sedan', pt.x, pt.y, pt.dir * (Math.PI / 2));
        car.color = '#20202a';
        car.tag = 'driveby';
        ctx.cars.push(car);
        ctx.peds.spawnGang(pt.x + 60, pt.y + 20, 2);
        ctx.subtitle('Watch out — gang car up ahead!', 2.4);
        this.active.push({ kind, x: pt.x, y: pt.y, t: 30 });
        break;
      }
      case 'racers': {
        // two sports cars blast past on a nearby road
        const pt = nearestRoadPoint(ctx.world, p.x + (Math.random() - 0.5) * 1200, p.y + (Math.random() - 0.5) * 900);
        if (dist(pt.x, pt.y, p.x, p.y) > 1100) return;
        for (let i = 0; i < 2; i++) {
          const car = makeCar('sports', pt.x - i * 70, pt.y - i * 14, 0);
          car.color = ['#30c8d8', '#e8d830'][i];
          car.angle = [0, Math.PI / 2, Math.PI, -Math.PI / 2][pt.dir];
          car.vx = Math.cos(car.angle) * car.spec.max * 0.8;
          car.vy = Math.sin(car.angle) * car.spec.max * 0.8;
          car.driver = 'traffic';
          car.ai = 'traffic';
          const dd = [[1, 0], [0, 1], [-1, 0], [0, -1]][pt.dir];
          car.aiState = {
            dir: pt.dir,
            node: { i: clamp(Math.round((pt.x + dd[0] * CFG.roadEvery) / CFG.roadEvery), 0, 8), j: clamp(Math.round((pt.y + dd[1] * CFG.roadEvery) / CFG.roadEvery), 1, 7) },
            stuck: 0, boost: 1,
          };
          ctx.cars.push(car);
        }
        ctx.subtitle('Street racers scream past.', 2);
        this.active.push({ kind, x: pt.x, y: pt.y, t: 20 });
        break;
      }
      case 'crowd': {
        // a small crowd gathers (busker, food truck vibe)
        const a = Math.random() * TAU;
        const d = 380 + Math.random() * 320;
        const cx = p.x + Math.cos(a) * d;
        const cy = p.y + Math.sin(a) * d;
        const zone = zoneAt(cx, cy);
        if (zone === 'water') return;
        for (let i = 0; i < 5; i++) {
          ctx.peds.spawnNear({ x: cx, y: cy });
        }
        this.active.push({ kind, x: cx, y: cy, t: 40 });
        break;
      }
      case 'beachparty': {
        // bonfire-ish crowd down at the sand
        const bx = 1000 + Math.random() * 4400;
        ctx.peds.spawnNear({ x: bx, y: 5800 });
        ctx.peds.spawnNear({ x: bx + 60, y: 5860 });
        ctx.peds.spawnNear({ x: bx - 60, y: 5870 });
        this.active.push({ kind, x: bx, y: 5820, t: 40 });
        break;
      }
      case 'copsweep': {
        // a lazy patrol pair cruises the player's district (harmless at 0★)
        const pt = nearestRoadPoint(ctx.world, p.x + (Math.random() - 0.5) * 1000, p.y + (Math.random() - 0.5) * 800);
        if (dist(pt.x, pt.y, p.x, p.y) > 1000) return;
        for (let i = 0; i < 2; i++) {
          const car = makeCar('police', pt.x - i * 60, pt.y, 0);
          car.driver = 'traffic';
          car.ai = 'traffic';
          car.patrol = true;
          const dd = [[1, 0], [0, 1], [-1, 0], [0, -1]][pt.dir];
          car.angle = [0, Math.PI / 2, Math.PI, -Math.PI / 2][pt.dir];
          car.aiState = {
            dir: pt.dir,
            node: { i: clamp(Math.round((pt.x + dd[0] * CFG.roadEvery) / CFG.roadEvery), 0, 8), j: clamp(Math.round((pt.y + dd[1] * CFG.roadEvery) / CFG.roadEvery), 1, 7) },
            stuck: 0,
          };
          ctx.cars.push(car);
        }
        ctx.subtitle('A patrol pair sweeps the block.', 2);
        this.active.push({ kind, x: pt.x, y: pt.y, t: 25 });
        break;
      }
      case 'drunk': {
        // one wobbly pedestrian meanders across the road
        const wx = p.x + (Math.random() - 0.5) * 700;
        const wy = clamp(p.y + (Math.random() - 0.5) * 500, CFG.waterTop + 80, CFG.beachTop - 40);
        const ped = ctx.peds.spawnNear({ x: wx, y: wy });
        if (ped) {
          ped.speed = 34;
          ped.drunk = true;
          ctx.subtitle('Someone had a big night.', 1.6);
        }
        this.active.push({ kind, x: wx, y: wy, t: 30 });
        break;
      }
    }
  }
}
