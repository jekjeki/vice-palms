// traffic.js — civilian lane AI: waypoint driving on the right-hand lane,
// intersection turns, red lights, queueing. Spawns/culls around the camera.

import { CFG, ctx } from './config.js';
import { clamp, dist, mulberry32 } from './util.js';
import { Car, CIV_TYPES, makeCar, steerToward } from './cars.js';
import { I_MIN, I_MAX, J_MIN, J_MAX, RE, DIRS, nodeValid, zoneAt } from './world.js';

const LANE = CFG.laneOff;

// lane offset for a heading dir: right-hand traffic
function laneOffset(dir) {
  switch (dir) {
    case 0: return { x: 0, y: LANE };    // east keeps south side
    case 1: return { x: -LANE, y: 0 };   // south keeps west side
    case 2: return { x: 0, y: -LANE };   // west keeps north side
    default: return { x: LANE, y: 0 };   // north keeps east side
  }
}

// red-light phase for an intersection: deterministic 8s cycle
// returns which axis has green: 'v' | 'h' | null (no light)
export function lightPhase(i, j, time) {
  if (((i + j) % 2) !== 0) return null;      // half the nodes are unlit
  const t = (time * 0.25) % 2;               // 8s cycle (4s per phase)
  return t < 1 ? 'v' : 'h';
}

export class Traffic {
  constructor() {
    this.rng = mulberry32(0xC0FFEE);
    this.spawnT = 0;
    this.dummy = { throttle: 0, steer: 0, hand: false };
  }

  count() {
    let n = 0;
    for (const c of ctx.cars) if (c.ai === 'traffic' && !c.dead) n++;
    return n;
  }

  update(dt, S) {
    const cam = ctx.renderer ? ctx.renderer.cam : { x: CFG.map / 2, y: CFG.map / 2 };
    this.spawnT -= dt;
    if (this.spawnT <= 0) {
      this.spawnT = 1.1;
      if (this.count() < CFG.trafficTarget) this.spawnNear(S, cam);
    }

    for (const car of ctx.cars) {
      if (car.ai !== 'traffic' || car.dead) continue;
      this.driveCar(car, dt, S);
      // cull far traffic
      if (dist(car.x, car.y, S.player.x, S.player.y) > 2100 && car.driver !== 'player') {
        car.dead = true;
        car.wreckT = 0;
      }
    }
  }

  spawnNear(S, cam) {
    const w = ctx.world;
    // pick a road point at 700–1500 from camera
    for (let tries = 0; tries < 12; tries++) {
      const ang = this.rng() * Math.PI * 2;
      const d = 750 + this.rng() * 750;
      const px = cam.x + Math.cos(ang) * d;
      const py = clamp(cam.y + Math.sin(ang) * d, CFG.waterTop + 200, CFG.beachTop - 100);
      const zone = zoneAt(px, py);
      if (zone === 'water' || zone === 'park' || zone === 'airfield') continue;
      const i = clamp(Math.round(px / RE), I_MIN, I_MAX);
      const j = clamp(Math.round(py / RE), J_MIN, J_MAX);
      const onV = Math.abs(px - i * RE) < 60;
      const onH = Math.abs(py - j * RE) < 60;
      if (!onV && !onH) continue;
      let dir, x, y;
      if (onV) {
        dir = this.rng() < 0.5 ? 1 : 3;
        x = i * RE + laneOffset(dir).x;
        y = clamp(py, CFG.waterTop + 150, CFG.beachTop - 60);
      } else {
        dir = this.rng() < 0.5 ? 0 : 2;
        y = j * RE + laneOffset(dir).y;
        x = px;
      }
      // don't spawn on top of another car
      let blocked = false;
      for (const c of ctx.cars) {
        if (!c.dead && dist(c.x, c.y, x, y) < 90) { blocked = true; break; }
      }
      if (blocked) continue;
      const type = CIV_TYPES[(this.rng() * CIV_TYPES.length) | 0];
      const car = makeCar(type, x, y, dir * (Math.PI / 2));
      // heading angle from dir: 0=E,1=S,2=W,3=N
      car.angle = [0, Math.PI / 2, Math.PI, -Math.PI / 2][dir];
      car.vx = Math.cos(car.angle) * car.spec.max * 0.4;
      car.vy = Math.sin(car.angle) * car.spec.max * 0.4;
      car.driver = 'traffic';
      car.ai = 'traffic';
      car.aiState = { dir, node: this.nextNode(x, y, dir), wait: 0, stuck: 0 };
      ctx.cars.push(car);
      return;
    }
  }

  // the next intersection node ahead along dir from a lane position
  nextNode(x, y, dir) {
    const d = DIRS[dir];
    // find the node we're heading toward: nearest node center in front
    const i = Math.round(x / RE), j = Math.round(y / RE);
    let ni = i, nj = j;
    if (d.dx > 0) ni = Math.max(i, Math.ceil(x / RE));
    if (d.dx < 0) ni = Math.min(i, Math.floor(x / RE));
    if (d.dy > 0) nj = Math.max(j, Math.ceil(y / RE));
    if (d.dy < 0) nj = Math.min(j, Math.floor(y / RE));
    if (!nodeValid(ni, nj)) { ni = i; nj = j; }
    return { i: ni, j: nj };
  }

  driveCar(car, dt, S) {
    const st = car.aiState;
    if (!st || !st.node) return;
    const w = ctx.world;
    const node = w.roadNodes[st.node.i] && w.roadNodes[st.node.i][st.node.j];
    if (!node) { car.aiState = null; car.ai = 'parked'; car.driver = null; return; }

    const dToNode = dist(car.x, car.y, node.x, node.y);

    // intersection reached → choose next direction
    if (dToNode < 26) {
      st.dir = this.chooseDir(st, node);
      st.node = this.nextNodeFrom(node, st.dir);
      if (!st.node) { // dead end (edge of grid): force reverse
        st.dir = (st.dir + 2) % 4;
        st.node = this.nextNodeFrom(node, st.dir);
      }
      if (!st.node) { // boxed in: abandon driving
        car.ai = 'parked'; car.driver = null; car.aiState = null; return;
      }
    }

    // waypoint = target node center + lane offset, pulled 20 short of center
    const lo = laneOffset(st.dir);
    const d = DIRS[st.dir];
    const tx = node.x + lo.x - d.dx * 20;
    const ty = node.y + lo.y - d.dy * 20;

    let throttle = 0.75;
    let steer = steerToward(car, tx, ty, dt);
    let hand = false;

    // red light: stop before the node
    const phase = lightPhase(st.node.i, st.node.j, S.time);
    const myAxis = (st.dir === 0 || st.dir === 2) ? 'h' : 'v';
    if (phase && phase !== myAxis && dToNode < 110 && dToNode > 40) {
      throttle = dToNode < 62 ? -0.6 : 0.15;
      if (dToNode < 62 && car.speed < 30) throttle = 0;
    }

    // queue: car ahead in my lane within 60 → match/stop
    const hx = Math.cos(car.angle), hy = Math.sin(car.angle);
    for (const other of ctx.cars) {
      if (other === car || other.dead) continue;
      const rx = other.x - car.x, ry = other.y - car.y;
      const fwd = rx * hx + ry * hy;
      if (fwd < 8 || fwd > 78) continue;
      const side = Math.abs(-rx * hy + ry * hx);
      if (side > 16) continue;
      const ospeed = (other.vx * hx + other.vy * hy);
      const mine = car.vx * hx + car.vy * hy;
      if (ospeed < mine - 5) {
        throttle = fwd < 48 ? (fwd < 30 ? 0 : -0.4) : 0.1;
      }
    }

    // player car ahead → brake politely (and honk sometimes)
    const pl = S.player;    if (pl.inCar && pl.inCar !== car) {
      const rx = pl.inCar.x - car.x, ry = pl.inCar.y - car.y;
      const fwd = rx * hx + ry * hy;
      const side = Math.abs(-rx * hy + ry * hx);
      if (fwd > 8 && fwd < 70 && side < 18) {
        throttle = Math.min(throttle, 0);
        if (this.rng() < 0.008) { car.honkT = 0.4; if (ctx.sfx) ctx.sfx('horn', car.x, car.y); }
      }
    }

    // buses idle at bus stops
    if (car.type === 'bus' && !car.stopIdle) {
      for (const bs of ctx.world.busStops) {
        if (dist(car.x, car.y, bs.x, bs.y) < 34 && car.speed < 40) {
          car.stopIdle = 2.6;
          break;
        }
      }
    }
    if (car.stopIdle > 0) {
      car.stopIdle -= dt;
      throttle = -0.5;
      if (car.speed < 8) throttle = 0;
    }

    // stuck detection → abandon car
    if (car.speed < 12 && throttle > 0.2) {
      st.stuck += dt;
      if (st.stuck > 6) { car.ai = 'parked'; car.driver = null; car.aiState = null; return; }
    } else st.stuck = 0;

    this.dummy.throttle = throttle;
    this.dummy.steer = steer;
    this.dummy.hand = hand;
    car.update(dt, this.dummy);
  }

  chooseDir(st, node) {
    const opts = [];
    for (let d = 0; d < 4; d++) {
      if (d === (st.dir + 2) % 4) continue;      // no U-turns
      const ni = node.i + DIRS[d].dx, nj = node.j + DIRS[d].dy;
      if (!nodeValid(ni, nj)) continue;
      opts.push(d);
    }
    if (opts.length === 0) return (st.dir + 2) % 4;
    if (opts.includes(st.dir) && this.rng() < 0.62) return st.dir;   // straight bias
    return opts[(this.rng() * opts.length) | 0];
  }

  nextNodeFrom(node, dir) {
    const ni = node.i + DIRS[dir].dx, nj = node.j + DIRS[dir].dy;
    if (!nodeValid(ni, nj)) return null;
    return { i: ni, j: nj };
  }
}
