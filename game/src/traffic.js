// traffic.js — civilian cars: spawn around the player, follow lanes on the
// right side of the road, obey lights, queue behind each other, and flee
// when the night turns loud.

import { CFG, DIRS, roadX, roadY } from './config.js';
import { G, RNG, clamp, dist, angNorm, angLerp } from './util.js';
import { Car, dirAng } from './cars.js';
import { sfxHorn } from './audio.js';

const CIVILIAN = ['stallion', 'voodoo', 'cabbie', 'pickme', 'wagon', 'van', 'bus', 'stallion', 'voodoo', 'blade', 'phantom'];

export class Traffic {
  constructor(seed) {
    this.rng = new RNG(seed ^ 0x1234abcd);
    this.panicT = 0;
  }

  panic(t = 5) { this.panicT = Math.max(this.panicT, t); }

  update(dt) {
    const w = G.world, cam = G.cam;
    this.panicT = Math.max(0, this.panicT - dt);

    // population scales up with the wanted level — the city gets brave
    let n = 0;
    for (const c of G.cars) if (c.ai && c.ai.kind === 'traffic') n++;
    const wantN = Math.max(8, CFG.TRAFFIC_N - (G.police ? G.police.stars * 3 : 0));
    if (n < wantN) {
      const tries = 3;
      for (let k = 0; k < tries && n < wantN; k++) this.trySpawn();
    }
    // despawn far cars
    for (let i = G.cars.length - 1; i >= 0; i--) {
      const c = G.cars[i];
      if (c.mission || c.driver === 'player' || c.driver === 'police') continue;
      const d = dist(c.x, c.y, cam.x, cam.y);
      const gone = (c.dead && c.wreckT > 25) || d > CFG.DESPAWN_R;
      if (gone && c.driver !== 'player') {
        G.cars.splice(i, 1);
      }
    }

    // drive
    for (const c of G.cars) {
      if (!c.ai || c.ai.kind !== 'traffic' || c.dead || c.driver === 'player') continue;
      this.drive(c, dt);
      c.update(dt);
    }
  }

  trySpawn() {
    const w = G.world, cam = G.cam;
    for (let attempt = 0; attempt < 6; attempt++) {
      const p = w.randomLanePoint(this.rng);
      const d = dist(p.x, p.y, cam.x, cam.y);
      if (d < CFG.SPAWN_R_MIN || d > CFG.SPAWN_R_MAX) continue;
      // keep clear of other cars
      let ok = true;
      for (const c of G.cars) {
        if (dist(c.x, c.y, p.x, p.y) < 90) { ok = false; break; }
      }
      if (!ok) continue;
      const type = this.rng.pick(CIVILIAN);
      const car = new Car(type, p.x, p.y, dirAng(p.dir), {
        driver: 'traffic',
        ai: { kind: 'traffic', axis: p.axis, idx: p.idx, dir: p.dir, node: null, cruise: this.rng.range(95, 150) },
      });
      G.cars.push(car);
      return car;
    }
    return null;
  }

  drive(car, dt) {
    const w = G.world;
    const ai = car.ai;
    const panic = this.panicT > 0;

    // current lane target
    const laneC = w.laneCenter(ai.axis, ai.idx, ai.dir);
    const d = DIRS[ai.dir];

    // cross-track error: signed distance from lane center along the right axis
    let e;
    if (ai.axis === 'v') {
      // lane is a constant x; right vector for dir is (-dy,dx) → x-axis sign
      e = (laneC - car.x) * (ai.dir === 1 ? 1 : -1);
    } else {
      e = (laneC - car.y) * (ai.dir === 0 ? 1 : -1);
    }
    e = clamp(e, -60, 60);

    const baseAng = dirAng(ai.dir);
    // heading error toward the lane direction, plus a cross-track correction
    const hd = angNorm(baseAng - car.h);
    const corr = clamp(-e * 0.02 * (ai.axis === 'v' ? (ai.dir === 1 ? -1 : 1) : (ai.dir === 0 ? -1 : 1)), -0.5, 0.5);
    const steer = clamp(hd * 2.2 + corr * 1.6, -1, 1);

    // node management
    if (!ai.node) {
      ai.node = advanceNode(car, w);
      ai.intent = null;          // chosen closer to the corner, so signals read right
      ai.blink = 0;
    }
    const nd = ai.node;
    const nx = roadX(nd.i), ny = roadY(nd.j);

    // distance to the intersection center along travel direction
    let distToNode;
    if (ai.dir === 0) distToNode = nx - car.x;
    else if (ai.dir === 2) distToNode = car.x - nx;
    else if (ai.dir === 1) distToNode = ny - car.y;
    else distToNode = car.y - ny;

    // traffic light: stop before entering on red
    let target = panic ? car.spec.max * 0.7 : ai.cruise;
    if (!panic && nd.hasLight) {
      const green = w.lightGreen(nd.i, nd.j, G.t);
      const myAxis = ai.axis === 'v' ? 'ns' : 'ew';
      const stopLine = CFG.RW / 2 + 12;
      if (green !== myAxis && distToNode > stopLine - 26 && distToNode < 120) {
        target = distToNode < stopLine + 8 ? 0 : 40;
        if (distToNode < stopLine + 30 && car.speed < 30) {
          // creep to the line
          target = clamp((distToNode - stopLine) * 1.2, 0, 30);
        }
      }
    }

    // queue: stop for the car ahead inside a forward cone
    const fx = Math.cos(car.h), fy = Math.sin(car.h);
    let ahead = null, aheadD = 1e9;
    for (const o of G.cars) {
      if (o === car || o.dead) continue;
      const dx = o.x - car.x, dy = o.y - car.y;
      const fd = dx * fx + dy * fy;
      if (fd < 8 || fd > 110) continue;
      const ld = Math.abs(dx * -fy + dy * fx);
      if (ld < 20 && fd < aheadD) { ahead = o; aheadD = fd; }
    }
    if (ahead) {
      target = Math.min(target, Math.max(0, (aheadD - 44) * 2.2));
    }
    // yield to anyone already on the asphalt in front of us
    for (const p of G.peds) {
      if (p.state === 'dead') continue;
      const dx = p.x - car.x, dy = p.y - car.y;
      const fd = dx * fx + dy * fy;
      if (fd < 10 || fd > 80) continue;
      const ld = Math.abs(dx * -fy + dy * fx);
      if (ld < 18) {
        target = Math.min(target, Math.max(0, (fd - 34) * 1.6));
        break;
      }
    }
    // don't mow the player on foot — brake
    const P = G.player;
    if (P && !P.car) {
      const dx = P.x - car.x, dy = P.y - car.y;
      const fd = dx * fx + dy * fy;
      const ld = Math.abs(dx * -fy + dy * fx);
      if (fd > 0 && fd < 90 && ld < 24) target = Math.min(target, Math.max(0, (fd - 42) * 2));
    }

    // buses actually serve their stops — and pull to the kerb like professionals
    if (car.type === 'bus') {
      if (ai.busStopT === undefined) ai.busStopT = 0;
      for (const st of w.busStops) {
        const sd = dist(st.x, st.y, car.x, car.y);
        if (sd < 46 && ai.busStopT <= 0 && ai.busServed !== st) {
          ai.busStopT = 3;
          ai.busServed = st;
        }
      }
      if (ai.busStopT > 0) {
        ai.busStopT -= dt;
        target = 0;
        // drift toward the kerb while boarding
        car.ctrl.steer = clamp(car.ctrl.steer - 0.5, -1, 1);
      }
    }

    // three stars of heat: civilians pull over and surrender the lane
    if (G.police && G.police.stars >= 3 && !panic) {
      for (const pc of G.cars) {
        if (pc.type !== 'police' || pc.dead || !pc.driver) continue;
        const dx = pc.x - car.x, dy = pc.y - car.y;
        const fd = dx * fx + dy * fy;
        if (fd > 0 && fd < 200 && Math.abs(dx * -fy + dy * fx) < 40) {
          target = 0;
          break;
        }
      }
    }

    car.ctrl.steer = steer;
    const spd = car.speed;
    car.ctrl.throttle = spd < target - 6 ? 0.8 : (spd > target + 8 ? -0.7 : 0);
    car.ctrl.hand = false;

    // pick the turn early and signal it like a decent citizen
    if (!ai.intent && distToNode < 130) {
      ai.intent = this.chooseDir(car, nd, w);
      ai.blink = ai.intent.dir === (ai.dir + 1) % 4 ? 1
        : ai.intent.dir === (ai.dir + 3) % 4 ? -1 : 0;
    }
    // stuck behind someone: a polite Vice Palms honk
    if (ahead && target <= 1 && spd < 12) {
      ai.blockedT = (ai.blockedT || 0) + dt;
      if (ai.blockedT > 2.6) {
        ai.blockedT = -6;
        if (dist(car.x, car.y, G.cam.x, G.cam.y) < 700) sfxHorn();
      }
    } else if (ai.blockedT > 0) {
      ai.blockedT = 0;
    }

    // passed the node → commit to the signalled turn
    if (distToNode < -10) {
      this.applyDir(car, nd, w);
    }
  }

  chooseDir(car, node, w) {
    const ai = car.ai;
    const rng = this.rng;
    const opts = [];
    const straight = ai.dir;
    const right = (ai.dir + 1) % 4;
    const left = (ai.dir + 3) % 4;
    for (const d of [straight, straight, right, left]) {  // straight bias
      if (d === (ai.dir + 2) % 4) continue;               // no U-turn
      if (d === 0 || d === 2) {                            // horizontal road j
        const ni = node.i + (d === 0 ? 1 : -1);
        if (ni < 0 || ni > CFG.COLS) continue;
        opts.push({ dir: d, axis: 'h', idx: node.j });
      } else {                                             // vertical road i
        const nj = node.j + (d === 1 ? 1 : -1);
        if (nj < 0 || nj > CFG.ROWS) continue;
        opts.push({ dir: d, axis: 'v', idx: node.i });
      }
    }
    if (opts.length === 0) {
      opts.push({ dir: (ai.dir + 2) % 4, axis: ai.axis, idx: ai.idx });
    }
    return rng.pick(opts);
  }

  applyDir(car, node, w) {
    const ai = car.ai;
    const pick = ai.intent || this.chooseDir(car, node, w);
    ai.dir = pick.dir; ai.axis = pick.axis; ai.idx = pick.idx;
    ai.node = null;
    ai.intent = null;
    ai.blink = 0;
    car.h = dirAng(ai.dir) + angNorm(dirAng(ai.dir) - car.h) * 0.4;
  }
}

// from car pos+dir find the next intersection node ahead
function advanceNode(car, w) {
  const n = w.nextNode(car.x, car.y, car.ai.dir);
  const i = clamp(n.i, 0, CFG.COLS), j = clamp(n.j, 0, CFG.ROWS);
  return { i, j, hasLight: true };
}
