// VICE PALMS — ambient traffic: cars keep to lanes on the grid, obey the
// two-phase lights, queue behind one another, and despawn far away.

import { CFG } from './config.js';
import { G } from './state.js';
import { dist, angTo, normAng, moveToward, clamp } from './util.js';
import { runRNG } from './rng.js';
import { phaseNow } from './world.js';
import { spawnTrafficCar, driveCar, carAhead, CAR_TYPES } from './cars.js';

export function manageTraffic(dt) {
  // despawn far cars that nobody is in
  const px = G.player.car ? G.player.car.x : G.player.x;
  const py = G.player.car ? G.player.car.y : G.player.y;
  for (let i = G.cars.length - 1; i >= 0; i--) {
    const c = G.cars[i];
    if (c.driver === 'player' || c.missionTag) continue;
    const d = dist(c.x, c.y, px, py);
    if (c.ai && c.ai.kind === 'traffic' && d > CFG.TRAFFIC_DESPAWN_R) { G.cars.splice(i, 1); continue; }
    if (c.driver === 'none' && !c.ai && d > 1600 && !c.missionTag && !c.locked) { G.cars.splice(i, 1); continue; }
    if (c.dead && c.deadT > 14 && d > 700) { G.cars.splice(i, 1); continue; }
  }

  // spawn up to the cap
  const trafficCount = G.cars.filter(c => c.ai && c.ai.kind === 'traffic' && !c.dead).length;
  G.trafficTimer -= dt;
  if (trafficCount < CFG.TRAFFIC_MAX && G.trafficTimer <= 0) {
    G.trafficTimer = 0.35;
    const car = spawnTrafficCar(runRNG, { x: px, y: py }, 620, CFG.TRAFFIC_SPAWN_R);
    if (car) G.cars.push(car);
  }
}

const TURN_CHANCES = { straight: 0.62, left: 0.19, right: 0.19 };

export function trafficBrain(car, dt) {
  const ai = car.ai;
  if (!ai || ai.kind !== 'traffic') return;
  if (car.dead) { car.throttle = 0; return; }

  const vertical = Math.abs(Math.sin(car.ang)) > 0.7;   // moving mostly along Y
  const dir = vertical ? Math.sign(Math.sin(car.ang)) : Math.sign(Math.cos(car.ang));
  const line = vertical ? nearestOf(G.world.roadsX, car.x) : nearestOf(G.world.roadsY, car.y);

  // target lane position
  const lane = line + dir * CFG.LANE_OFF;
  const cross = vertical ? car.x : car.y;
  const drift = (lane - cross);

  // desired speed: base, unless red light ahead or car ahead
  let want = ai.speed;

  // queueing
  const ahead = carAhead(car, 95);
  if (ahead) {
    const d = dist(car.x, car.y, ahead.x, ahead.y);
    want = Math.min(want, Math.max(0, (d - 46) * 2.2));
    if (d < 52) want = 0;
  }

  // traffic lights: check the next intersection along our axis
  const phase = phaseNow(G.time);
  const lines = vertical ? G.world.roadsY : G.world.roadsX;
  let nextCross = null;
  for (const ry of lines) {
    const aheadDist = vertical ? (ry - car.y) * dir : (ry - car.x) * dir;
    if (aheadDist > 20 && aheadDist < 130) { nextCross = { at: ry, dist: aheadDist }; break; }
  }
  if (nextCross && !lightGreenFor(vertical, phase)) {
    if (nextCross.dist < 74 && nextCross.dist > 6) want = Math.min(want, Math.max(0, (nextCross.dist - 56) * 3));
  }

  // turning decisions when passing an intersection center
  ai.waitT -= dt;
  if (nextCross && nextCross.dist < 8 && !ai.turned) {
    ai.turned = true;
    const roll = runRNG.next();
    if (roll > TURN_CHANCES.straight) {
      // turn: become a car on the crossing road
      const newDir = roll > TURN_CHANCES.straight + TURN_CHANCES.left ? 1 : -1;
      const newLine = nextCross.at;
      if (newLine > 200 && newLine < (vertical ? CFG.BEACH_Y : 4060)) {
        ai.turnTo = { vertical: !vertical, line: newLine, dir: newDir };
      }
    }
  }
  if (!nextCross || nextCross.dist > 40) ai.turned = false;

  // smooth cross-axis correction toward lane
  const steerAmt = clamp(drift / 40, -1, 1);
  car.steer = vertical ? steerAmt * dir : steerAmt * -dir;
  // hmm: steering semantics handled by driveCar; simpler: nudge heading
  const targetAng = vertical ? (dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (dir > 0 ? 0 : Math.PI);
  let corr = normAng(targetAng - car.ang);
  // lane correction biases the heading
  corr += clamp(drift * (vertical ? -dir : dir) / 260, -0.5, 0.5);
  car.ang += clamp(corr, -1.8 * dt, 1.8 * dt);

  // execute a queued turn: rotate to the new axis when we reach the crossing point
  if (ai.turnTo) {
    const t = ai.turnTo;
    const alongPos = vertical ? car.y : car.x;
    const targetPos = t.line + t.dir * CFG.LANE_OFF;
    if (Math.abs(alongPos - targetPos) < 30) {
      car.ang = t.vertical ? (t.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (t.dir > 0 ? 0 : Math.PI);
      ai.turnTo = null;
      ai.turned = true;
    }
  }

  car.throttle = want > Math.hypot(car.vx, car.vy) + 8 ? 0.7 : (want < Math.hypot(car.vx, car.vy) - 12 ? -0.6 : 0);
  if (want === 0) { car.throttle = -0.4; }
  car.hand = false;
}

function nearestOf(arr, v) {
  let best = arr[0], bd = Math.abs(arr[0] - v);
  for (const a of arr) { const d = Math.abs(a - v); if (d < bd) { bd = d; best = a; } }
  return best;
}

function lightGreenFor(vertical, phase) {
  // phase 0: NS green ; phase 1: EW green
  return vertical ? phase === 0 : phase === 1;
}

export function clampTrafficSpeed(car) { car.ai && (car.ai.speed = Math.min(car.ai.speed, CFG.TRAFFIC_SPEED * 1.25)); }
