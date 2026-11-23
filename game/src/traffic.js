// ---------------------------------------------------------------------------
// traffic.js — ambient civilians driving the road graph. Cars follow lanes on
// the right, obey traffic lights, queue behind each other, brake for
// pedestrians, show turn signals, have individual driving personalities
// (cruise speed, aggression, politeness) and un-stick themselves when wedged.
// Spawning stays near the player; distant cars despawn.
// ---------------------------------------------------------------------------

import { CFG, TRAFFIC_MIX } from './config.js';
import { RNG } from './rng.js';
import { Car } from './cars.js';
import { clamp, dist2, wrapAngle } from './util.js';

const LANE = CFG.LANE_OFF;

// driver personality — scales cruise speed and following distance
const PERSONAS = [
  { name: 'granny', cruise: [150, 195], gap: 1.6, signalP: 0.9 },
  { name: 'commuter', cruise: [195, 250], gap: 1.2, signalP: 0.7 },
  { name: 'courier', cruise: [240, 285], gap: 1.0, signalP: 0.5 },
  { name: 'hothead', cruise: [275, 330], gap: 0.7, signalP: 0.2 },
];

export class Traffic {
  constructor(worldRef, rng) {
    this.world = worldRef;
    this.rng = rng;
    this.cars = [];
    this.spawnTimer = 0;
    this.laneQueue = new Map();   // node id -> count of cars waiting (rough)
  }

  count() { return this.cars.length; }

  lightAt(node, axis, time) {
    return this.world.lightState(node, axis, time);
  }

  update(dt, game) {
    const player = game.player;
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0 && this.cars.length < CFG.TRAFFIC_TARGET) {
      this.spawnTimer = 0.35;
      this.trySpawn(game);
    }
    for (let i = this.cars.length - 1; i >= 0; i--) {
      const c = this.cars[i];
      if (c.wrecked) {
        c.wreckTimer = (c.wreckTimer || 14) - dt;
        if (c.wreckTimer <= 0) this.cars.splice(i, 1);
        continue;
      }
      if (c.driver === 'player') continue;      // player took this one over
      if (c.parked) continue;
      this.updateAI(c, dt, game);
      const d2 = dist2(c.x, c.y, player.x, player.y);
      if (d2 > CFG.TRAFFIC_CULL_R * CFG.TRAFFIC_CULL_R && !c.missionTag) {
        this.cars.splice(i, 1);
      }
    }
  }

  /** right-hand lane position travelling from a toward b */
  lanePos(a, b, t) {
    const dx = b.x - a.x, dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len, uy = dy / len;
    return { x: a.x + dx * t - uy * LANE, y: a.y + dy * t + ux * LANE, ux, uy, len };
  }

  trySpawn(game) {
    const player = game.player;
    for (let t = 0; t < 14; t++) {
      const node = this.world.randomGraphNode(this.rng);
      const d2 = dist2(node.x, node.y, player.x, player.y);
      if (d2 < 620 * 620 || d2 > CFG.TRAFFIC_SPAWN_R * CFG.TRAFFIC_SPAWN_R) continue;
      if (!node.edges.length) continue;
      // don't spawn right on top of another car
      if (this.tooClose(node.x, node.y, 90)) continue;
      const edge = this.rng.pick(node.edges);
      const type = this.rng.weighted(TRAFFIC_MIX);
      const car = this.makeCar(type, node, edge.to);
      car.driver = 'ai';
      this.cars.push(car);
      return car;
    }
    return null;
  }

  tooClose(x, y, r) {
    for (const c of this.cars) {
      if (dist2(c.x, c.y, x, y) < r * r) return true;
    }
    return false;
  }

  makeCar(type, fromNode, toNode) {
    const pos = this.lanePos(fromNode, toNode, 0);
    const angle = Math.atan2(toNode.y - fromNode.y, toNode.x - fromNode.x);
    const car = new Car(type, pos.x, pos.y, angle);
    car.from = fromNode;
    car.lastNode = fromNode;
    car.route = [toNode];
    car.segAxis = Math.abs(toNode.y - fromNode.y) > Math.abs(toNode.x - fromNode.x) ? 'v' : 'h';
    car.t = 0;
    const persona = this.rng.pick(PERSONAS);
    car.persona = persona.name;
    car.cruise = this.rng.range(persona.cruise[0], persona.cruise[1]);
    car.gapK = persona.gap;
    car.signalP = persona.signalP;
    car.signal = 0;              // -1 left, 0 off, 1 right (visual)
    return car;
  }

  updateAI(c, dt, game) {
    if (!c.route || !c.route.length) this.pickRoute(c);
    const target = c.route[0];
    if (!target) { c.speed *= 0.9; c.step(dt, { throttle: 0, steer: 0 }, this.world); return; }

    // buses dwell at the rank shelters for a few seconds (route romance)
    if (c.type === 'bus' && !c.dwelled) {
      for (const r of this.world.taxiRanks) {
        if (dist2(c.x, c.y, r.x, r.y) < 60 * 60 && Math.abs(c.speed) < 20) {
          c.dwelled = 3;
          break;
        }
      }
    }
    if (c.dwelled > 0) {
      c.dwelled -= dt;
      c.speed *= 0.8;
      c.step(dt, { throttle: 0, steer: 0 }, this.world);
      if (c.dwelled <= 0) c.dwelled = -1; // -1 marks "already dwelled"
      return;
    }

    // keep the turn signal honest
    this.updateSignal(c, target);

    const lead = this.lanePos(c.from, target, clamp(c.t + 0.06, 0, 1));
    const desired = Math.atan2(lead.y - c.y, lead.x - c.x);
    const steer = clamp(wrapAngle(desired - c.angle) * 2.4, -1, 1);

    // rain makes careful drivers cautious — personas ease off in the wet
    if (game.weather && game.weather.intensity > 0 && !c.wetAdjusted) {
      c.wetAdjusted = true;
      c.cruise *= 0.82;
    } else if ((!game.weather || game.weather.intensity === 0) && c.wetAdjusted) {
      c.wetAdjusted = false;
      c.cruise /= 0.82;
    }

    // ---- desired speed: persona cruise minus lights, queues, hazards
    let want = c.cruise;
    const dNode = Math.hypot(target.x - c.x, target.y - c.y);
    const axis = c.segAxis;
    const light = this.world.lightState(target, axis, game.time);
    if (light === 'stop' && dNode < 170) want = Math.min(want, (dNode - 52) * 2.2);
    if (light === 'stop' && dNode < 58) want = 0;

    const ahead = this.carAhead(c, game);
    if (ahead) {
      const gap = ahead.dist - (c.spec.len / 2 + ahead.car.spec.len / 2 + 12);
      const polite = c.gapK || 1;
      if (gap < 60 * polite) want = Math.min(want, ahead.car.speed * (0.85 + 0.1 * polite));
      if (gap < 16 * polite) want = 0;
    }
    // pedestrians crossing the road ahead → hard brake (the AI tries to be good)
    const pedBlock = this.pedAhead(c, game);
    if (pedBlock) want = Math.min(want, 30);

    // player on foot ahead → brake (don't murder pedestrians… on purpose)
    const p = game.player;
    if (!p.inCar) {
      const pd = dist2(p.x, p.y, c.x, c.y);
      if (pd < 120 * 120) {
        const fwd = Math.cos(c.angle) * (p.x - c.x) + Math.sin(c.angle) * (p.y - c.y);
        if (fwd > 0) want = Math.min(want, 40);
      }
    }
    const dV = want - c.speed;
    const throttle = dV > 24 ? 1 : dV < -24 ? -1 : 0;
    // wedged against geometry? reverse out and straighten
    if (c.isStuck(dt)) { c.unstuckStep(dt); return; }
    c.step(dt, { throttle, steer, handbrake: false, grip: game.weather.gripMult() }, this.world);
    c.collideWorld(this.world);

    // ---- progress along the segment
    const segLen = Math.hypot(target.x - c.from.x, target.y - c.from.y) || 1;
    const along = ((c.x - c.from.x) * (target.x - c.from.x) + (c.y - c.from.y) * (target.y - c.from.y)) / segLen;
    c.t = clamp(along / segLen, 0, 1.2);
    if (dNode < 36) this.advanceNode(c, target);
    if (c.speed < -5) c.speed = 0;
  }

  updateSignal(c, target) {
    // blinking in the direction of the upcoming turn
    if (!c.route || c.route.length < 1) { c.signal = 0; return; }
    const dNode = Math.hypot(target.x - c.x, target.y - c.y);
    if (dNode > 190) { c.signal = 0; return; }
    const next = this.nextTurnDir(c, target);
    if (next === 0 || !this.rng.chance(c.signalP)) { c.signal = 0; return; }
    c.signal = next;
  }

  /** +1 turns right at the upcoming node, -1 left, 0 straight */
  nextTurnDir(c, target) {
    const opts = target.edges.filter((e) => e.to !== (c.lastNode || c.from));
    if (!opts.length || !c.route[0]) return 0;
    const cur = c.route[0];
    const heading = { x: cur.x - c.from.x, y: cur.y - c.from.y };
    for (const e of opts) {
      const nx = e.to.x - target.x, ny = e.to.y - target.y;
      const cross = heading.x * ny - heading.y * nx;
      if (Math.abs(cross) < 1) continue;
      return cross > 0 ? 1 : -1;
    }
    return 0;
  }

  advanceNode(c, node) {
    const came = c.lastNode || c.from;
    const options = node.edges.filter((e) => e.to !== came);
    const pool = options.length ? options : node.edges;
    // dead end? spin the car around (u-turn) by picking the reverse edge
    const uTurn = !options.length;
    let edge = this.rng.pick(pool);
    const straight = pool.find((e) => (e.seg.axis === 'v') === (c.segAxis === 'v'));
    if (straight && this.rng.chance(uTurn ? 0 : 0.62)) edge = straight;
    c.lastNode = node;
    c.from = node;
    c.route = [edge.to];
    c.segAxis = edge.seg.axis;
    c.t = 0;
  }

  pickRoute(c) {
    const near = this.nearestNode(c.x, c.y);
    if (!near || !near.node.edges.length) { c.route = []; return; }
    c.from = near.node;
    c.lastNode = near.node;
    const edge = this.rng.pick(near.node.edges);
    c.route = [edge.to];
    c.segAxis = edge.seg.axis;
    c.t = 0;
  }

  nearestNode(x, y) {
    let best = null, bd = Infinity;
    for (const n of this.world.nodes) {
      const d = dist2(x, y, n.x, n.y);
      if (d < bd) { bd = d; best = n; }
    }
    return best ? { node: best, d: bd } : null;
  }

  /** nearest vehicle ahead in the driving corridor */
  carAhead(c, game) {
    const fx = Math.cos(c.angle), fy = Math.sin(c.angle);
    let best = null;
    const check = (other) => {
      if (other === c || other.wrecked) return;
      const dx = other.x - c.x, dy = other.y - c.y;
      const d = Math.hypot(dx, dy);
      if (d > 130) return;
      const fwd = (dx * fx + dy * fy) / (d || 1);
      if (fwd < 0.7) return;
      const lat = Math.abs(-fy * dx + fx * dy);
      if (lat > 26) return;
      if (!best || d < best.dist) best = { car: other, dist: d };
    };
    for (const o of this.cars) check(o);
    for (const o of game.police.cruisers) check(o);
    if (game.player.inCar && game.player.inCar !== c) check(game.player.inCar);
    // queue etiquette: hotheads lean on the horn when stuck behind slowpokes
    if (best && best.dist < 60 && best.car.speed < c.cruise * 0.4 && c.persona === 'hothead' && game.rng.chance(0.02)) {
      best.car.honkedBy = c.id;
      if (game.rng.chance(0.5)) game.audio.honk();
    }
    return best;
  }

  /** pedestrian inside the braking corridor ahead */
  pedAhead(c, game) {
    const fx = Math.cos(c.angle), fy = Math.sin(c.angle);
    for (const p of game.peds.list) {
      if (p.state === 'dead') continue;
      const dx = p.x - c.x, dy = p.y - c.y;
      const d = Math.hypot(dx, dy);
      if (d > 90) continue;
      const fwd = (dx * fx + dy * fy) / (d || 1);
      if (fwd < 0.8) continue;
      const lat = Math.abs(-fy * dx + fx * dy);
      if (lat < 20) return true;
    }
    return false;
  }

  /** gunshots clear the road a little — drivers speed up and scatter */
  panicNear(x, y, r) {
    for (const c of this.cars) {
      if (dist2(c.x, c.y, x, y) < r * r) c.cruise = Math.max(c.cruise, 320);
    }
  }
}
