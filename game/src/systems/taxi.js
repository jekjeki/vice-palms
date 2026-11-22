// Taxi shifts: three ranks around the city. Sign up at a rank in any car and the
// fares start calling — a passenger waits at the kerb (destination arrow on the HUD),
// the meter runs from the moment they step in, and the payout tips for smooth,
// quick driving and docks you for crash landings. End the shift at any rank.
//
// The whole job is deliberately low-friction: one key to start, one key to end, and
// the car you brought stays your car.

import { PITCH, GRID } from '../config.js';
import { clamp, dist2, lerp } from '../util.js';
import { rand, randInt } from '../rng.js';

const RANKS = [
  { name: 'SOUTHSIDE RANK', x: 10 * PITCH + 44, y: 20 * PITCH - 46 },
  { name: 'STRIP RANK', x: 33 * PITCH + 44, y: 5 * PITCH - 46 },
  { name: 'OLD TOWN RANK', x: 20 * PITCH + 44, y: 33 * PITCH - 46 },
];

const FARE_NAMES = ['MARISOL', 'DEACON', 'MISS ORTIZ', 'CHUY', 'PASTOR ELI', 'NENA', 'BIG RAY', 'SOÑadora LULU', 'JUDGE PRATT', 'COOKIE'];
const FARE_QUIPS = [
  'Take the fast way.', 'No sudden moves, please.', 'You know the Blue Iguana? Then you know my stop.',
  'Meter says what it says. I pay what it says.', 'My cousin says you drove ambulances. Prove it.',
  'Ignore the tapping. That is just the briefcase.', 'Radio low, windows up, and we are friends.',
  'I am late, but do not get us killed about it.', 'Ever driven a fare with a fish tank? Today you have.',
];
const BOARD_RANGE = 74;      // stop this close to collect or drop
const IDLE_SPEED = 34;       // and be going slower than this
const METER_BASE = 6.5;      // flag fall
const METER_RATE = 0.0165;   // per world unit
const TIP_MAX = 0.45;

// Fare variety: most hails are regulars, some want speed, some pay for patience.
const FARE_TYPES = [
  { id: 'regular', label: 'REGULAR', mult: 1, weight: 62 },
  { id: 'dash', label: 'FARE DASH — beat the clock for double', mult: 2, weight: 22, timed: 100 },
  { id: 'longhaul', label: 'LONG HAUL — big ride, big payout', mult: 1.6, weight: 10, minDist: 2200 },
  { id: 'chatty', label: 'TALKER — tips big if you drive smooth', mult: 1.2, weight: 16, smoothMin: 0.55 },
];

export function createTaxi(game) {
  const T = {
    game,
    ranks: RANKS,
    active: false,
    stage: null,             // pickup | drop
    fare: null,              // {x, y, name}
    dest: null,
    passenger: false,
    meter: 0,
    faresDone: 0,
    earned: 0,
    smooth: 0,               // decays with hard driving
    crashes: 0,
    hpMark: 0,
    boardT: 0,
    lastCar: null,
    avgSpeed: 0,
    speedN: 0,
    banner: null,
    bannerT: 0,
  };

  // ---------------------------------------------------------------- persistence

  T.serialize = () => ({ faresDone: T.faresDone, earned: Math.round(T.earned) });
  T.restore = (d) => {
    if (!d) return;
    T.faresDone = d.faresDone ?? 0;
    T.earned = d.earned ?? 0;
  };

  // ---------------------------------------------------------------- lifecycle

  T.tryInteract = function (p) {
    const rank = nearRank(p);
    if (!rank) return false;
    if (!T.active) {
      if (!p.car) { game.toast('Bring a car to the rank to start a shift.', '#ffd977'); return true; }
      if (p.car.wreck) return false;
      T.active = true;
      T.lastCar = p.car;
      T.hpMark = p.car.hp;
      T.smooth = 1;
      T.crashes = 0;
      T.earned = 0;
      T.avgSpeed = 0; T.speedN = 0;
      T.banner = 'TAXI SHIFT — ' + rank.name;
      T.bannerT = 2.6;
      game.toast(`Taxi shift started at ${rank.name}.`, '#ffd977');
      nextFare();
      return true;
    }
    // Ending a shift: only between fares. The rank gives a shift summary.
    if (!T.fare) {
      const grade = T.faresDone === 0 ? 'NO FARES — the dispatcher sighs.'
        : T.faresDone >= 5 ? 'SHIFT GRADE A — dispatcher whistles.'
        : T.faresDone >= 3 ? 'SHIFT GRADE B — solid night.'
        : 'SHIFT GRADE C — a quiet one.';
      game.toast(`Shift ended. ${T.faresDone} fares, $${Math.round(T.earned)} on the meter. ${grade}`, '#7bffd4');
      T.active = false;
      T.stage = null;
      T.dest = null;
      T.passenger = false;
      game.save();
      return true;
    }
    game.toast('Finish the fare first — the customer is in the cab.', '#ffd977');
    return true;
  };

  function nearRank(p) {
    let best = null, bd = 120 * 120;
    for (const r of RANKS) {
      const d = dist2(r.x, r.y, p.x, p.y);
      if (d < bd) { bd = d; best = r; }
    }
    return best;
  }

  function cancel(reason) {
    if (!T.active) return;
    T.active = false;
    T.stage = null;
    T.fare = null;
    T.dest = null;
    T.passenger = false;
    if (reason) game.toast(reason, '#ff7a3c');
  }

  T.cancel = cancel;

  /** A new fare: a kerbside point a healthy drive away, on a road edge, with a
   *  fare type rolled off the weighted table. */
  function nextFare() {
    const p = game.player;
    // Weighted type pick, honoring any minimum-distance rule a type carries.
    let type = FARE_TYPES[0];
    for (let tries = 0; tries < 24; tries++) {
      let pick = Math.random() * FARE_TYPES.reduce((a, t) => a + t.weight, 0);
      for (const t of FARE_TYPES) { pick -= t.weight; if (pick <= 0) { type = t; break; } }
      break;
    }
    for (let tries = 0; tries < 24; tries++) {
      const i = randInt(GRID), j = randInt(GRID);
      const x = i * PITCH + (rand() < 0.5 ? 52 : PITCH - 52);
      const y = j * PITCH + 46 + rand() * (PITCH - 92);
      const d = Math.hypot(x - p.x, y - p.y);
      if (d < 700 || d > 3200) continue;
      if (type.minDist && d < type.minDist) continue;
      T.fare = { x, y, name: FARE_NAMES[randInt(FARE_NAMES.length)], type };
      T.stage = 'pickup';
      T.boardT = 0;
      T.meter = 0;
      T.dest = null;
      T.passenger = false;
      break;
    }
  }

  function nextDest() {
    const p = game.player;
    for (let tries = 0; tries < 24; tries++) {
      const i = randInt(GRID), j = randInt(GRID);
      const x = i * PITCH + (rand() < 0.5 ? 52 : PITCH - 52);
      const y = j * PITCH + 46 + rand() * (PITCH - 92);
      const d = Math.hypot(x - p.x, y - p.y);
      if (d < 900 || d > 3600) continue;
      T.dest = { x, y };
      T.stage = 'drop';
      break;
    }
  }

  // ---------------------------------------------------------------- update

  T.update = function (dt, p) {
    T.bannerT = Math.max(0, T.bannerT - dt);

    if (!T.active) {
      // Rank prompt while idle.
      if (!p.car) {
        const rank = nearRank(p);
        if (rank && game.hud) game.hud.setPrompt('E — START TAXI SHIFT (' + rank.name + ')');
      }
      return;
    }

    const car = p.car;
    // No cab, no job.
    if (!car) {
      T.walkT = (T.walkT ?? 0) + dt;
      if (T.walkT > 2) { cancel('You left the cab. The rank takes its hat back.'); T.walkT = 0; }
      return;
    }
    T.walkT = 0;
    if (car.wreck) { cancel('The cab is on fire. Shift over.'); return; }

    // Smoothness bookkeeping: hard braking from speed and crash damage both bite.
    const speed = Math.hypot(car.vx, car.vy);
    T.avgSpeed = lerp(T.avgSpeed, speed, Math.min(1, dt * 0.6));
    T.speedN += dt;
    if (car.brake > 0 && speed > 240) T.smooth = Math.max(0, T.smooth - dt * 0.55);
    else T.smooth = Math.min(1, T.smooth + dt * 0.06);
    if (car.hp < T.hpMark - 2) {
      T.crashes += 1;
      T.hpMark = car.hp;
    } else if (car.hp > T.hpMark) T.hpMark = car.hp;

    if (!T.fare) { T.betweenT = (T.betweenT ?? 0) + dt; if (T.betweenT > 1.6) { T.betweenT = 0; nextFare(); } return; }

    if (T.stage === 'pickup') {
      const d = Math.hypot(T.fare.x - car.x, T.fare.y - car.y);
      if (d < BOARD_RANGE && speed < IDLE_SPEED) {
        T.boardT += dt;
        if (T.boardT > 0.8) {
          T.passenger = true;
          T.meter = METER_BASE;
          T.meterFrom = { x: car.x, y: car.y };
          nextDest();
          const t = T.fare.type;
          if (t.timed) T.dashT = t.timed;
          game.toast(`${T.fare.name} hops in. “${FARE_QUIPS[randInt(FARE_QUIPS.length)]}”`, '#e8e4d4');
          if (t.id !== 'regular') game.toast(`${t.label}`, '#33e7ff');
          game.audio.blip(520);
        }
      } else T.boardT = Math.max(0, T.boardT - dt * 2);
    } else if (T.stage === 'drop' && T.dest) {
      // The meter climbs with distance actually covered since boarding.
      const from = T.meterFrom;
      T.meter = METER_BASE + METER_RATE * Math.hypot(car.x - from.x, car.y - from.y);
      // Fare Dash rides a soft clock: reaching the drop-off in time keeps the double.
      if (T.dashT != null && T.dashT > 0) T.dashT -= dt;
      const d = Math.hypot(T.dest.x - car.x, T.dest.y - car.y);
      if (d < BOARD_RANGE && speed < IDLE_SPEED) {
        T.boardT += dt;
        if (T.boardT > 0.8) dropOff(p, car);
      } else T.boardT = Math.max(0, T.boardT - dt * 2);
    }
  };

  function dropOff(p, car) {
    const distance = T.meter - METER_BASE;
    // Tip curve: smoothness is the big lever, average pace adds, crashes subtract.
    let tipRate = TIP_MAX * T.smooth - Math.min(0.4, T.crashes * 0.09);
    const pace = clamp((T.avgSpeed - 140) / 260, -0.1, 0.18);
    let mult = T.fare.type.mult ?? 1;
    // A talker refuses to tip a scuffed ride; a dash missed halves the purse.
    if (T.fare.type.smoothMin && T.smooth < T.fare.type.smoothMin) mult *= 0.6;
    if (T.fare.type.timed && (T.dashT ?? 0) <= 0) mult *= 0.5;
    if (T.fare.type.timed && (T.dashT ?? 0) > 0) tipRate += 0.15;
    const tip = Math.max(-2, Math.round(T.meter * (tipRate + pace)));
    const total = Math.max(4, Math.round((T.meter + tip) * mult));
    p.money += total;
    T.earned += total;
    T.faresDone++;
    const smoothWord = T.smooth > 0.8 ? 'silky' : T.smooth > 0.45 ? 'fair' : 'rough';
    game.toast(`${T.fare.name} pays $${total} (${smoothWord}${T.crashes ? `, ${T.crashes} scuffs` : ''}).`, '#7bffd4');
    game.audio.blip(700);
    game.fx.cash?.(car.x, car.y);
    T.fare = null;
    T.dest = null;
    T.passenger = false;
    T.meter = 0;
    T.boardT = 0;
    T.betweenT = 0;
    game.save();
  }

  // ---------------------------------------------------------------- markers + render

  /** World-space markers drawn inside paint.base: rank umbrellas and the fare. */
  T.drawWorld = function (ctx, view) {
    // Rank posts: a little canopy and a sign.
    for (const r of RANKS) {
      if (r.x < view.x0 - 120 || r.x > view.x1 + 120 || r.y < view.y0 - 120 || r.y > view.y1 + 120) continue;
      ctx.fillStyle = 'rgba(10,14,20,0.35)';
      ctx.beginPath(); ctx.ellipse(r.x, r.y + 6, 30, 12, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#f2cf47';
      ctx.fillRect(r.x - 26, r.y - 8, 52, 14);
      ctx.fillStyle = '#20242c';
      ctx.fillRect(r.x - 3, r.y - 2, 6, 26);
      ctx.fillStyle = '#20242c';
      ctx.font = 'bold 10px Consolas, monospace';
      ctx.textAlign = 'center';
      ctx.fillText('TAXI', r.x, r.y + 2);
    }
    // The waiting fare: a small figure with a raised arm, bobbing.
    if (T.active && T.stage === 'pickup' && T.fare) {
      const f = T.fare;
      const bob = Math.sin(game.time * 3) * 2;
      ctx.fillStyle = 'rgba(10,14,20,0.4)';
      ctx.beginPath(); ctx.ellipse(f.x, f.y + 6, 10, 4, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#d8b56a';
      ctx.beginPath(); ctx.arc(f.x, f.y - 8 + bob, 6, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#4a5570';
      ctx.fillRect(f.x - 5, f.y - 2 + bob, 10, 14);
      ctx.strokeStyle = '#d8b56a';
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.moveTo(f.x + 4, f.y + bob); ctx.lineTo(f.x + 12, f.y - 12 + bob);
      ctx.stroke();
      // Pulsing kerb ring.
      const pulse = 0.4 + 0.3 * Math.sin(game.time * 4);
      ctx.strokeStyle = `rgba(255,217,119,${pulse})`;
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(f.x, f.y, BOARD_RANGE, 0, Math.PI * 2); ctx.stroke();
    }
    // Destination kerb marker.
    if (T.active && T.stage === 'drop' && T.dest) {
      const d = T.dest;
      const pulse = 0.4 + 0.3 * Math.sin(game.time * 4);
      ctx.strokeStyle = `rgba(123,255,212,${pulse})`;
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(d.x, d.y, BOARD_RANGE, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = 'rgba(123,255,212,0.85)';
      ctx.font = 'bold 11px Consolas, monospace';
      ctx.textAlign = 'center';
      ctx.fillText('DROP', d.x, d.y - 8);
    }
  };

  /** HUD: meter plate + destination arrow, drawn from hud.js. */
  T.drawHud = function (ctx, W, H) {
    if (!T.active) return;
    const p = game.player;

    // Meter plate, top-left below the minimap band.
    ctx.save();
    const pw = 218;
    ctx.fillStyle = 'rgba(5,7,15,0.74)';
    ctx.fillRect(20, 96, pw, 78);
    ctx.strokeStyle = 'rgba(242,207,71,0.55)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(20, 96, pw, 78);
    ctx.textAlign = 'left';
    ctx.fillStyle = '#f2cf47';
    ctx.font = 'bold 15px Consolas, monospace';
    ctx.fillText('TAXI', 34, 118);
    ctx.fillStyle = '#e8e4d4';
    ctx.font = 'bold 17px Consolas, monospace';
    ctx.fillText(T.fare ? `$${T.meter.toFixed(1)}` : `$${T.earned} banked`, 34, 142);
    ctx.fillStyle = 'rgba(232,228,212,0.7)';
    ctx.font = '11px Consolas, monospace';
    const label = T.fare ? (T.fare.type?.id === 'regular' ? T.fare.name : `${T.fare.name} · ${T.fare.type?.id.toUpperCase()}`) : (T.passenger ? 'cruising' : 'cruising');
    ctx.fillText(`${T.faresDone} fares · ${T.passenger ? label : 'cruising for fares'}`, 34, 160);
    // Fare Dash countdown when the clock is running.
    if (T.passenger && (T.dashT ?? 0) > 0) {
      ctx.fillStyle = T.dashT < 20 ? '#ff7a3c' : '#33e7ff';
      ctx.font = 'bold 12px Consolas, monospace';
      ctx.fillText(`DASH CLOCK ${Math.ceil(T.dashT)}s`, 34, 174);
    }
    ctx.restore();

    // Destination arrow along the screen edge toward the current goal.
    const goal = T.stage === 'pickup' ? T.fare : T.dest;
    if (!goal) return;
    const cam = game.camera;
    const sx = W / 2 + (goal.x - cam.x) * cam.zoom;
    const sy = H / 2 + (goal.y - cam.y) * cam.zoom;
    const off = sx < 60 || sx > W - 60 || sy < 60 || sy > H - 60;
    const d = Math.hypot(goal.x - p.x, goal.y - p.y);
    if (off) {
      const ang = Math.atan2(goal.y - cam.y, goal.x - cam.x);
      const rx = W / 2 + Math.cos(ang) * (Math.min(W, H) * 0.38);
      const ry = H / 2 + Math.sin(ang) * (Math.min(W, H) * 0.38);
      drawChevron(ctx, rx, ry, ang, T.stage === 'pickup' ? '#ffd977' : '#7bffd4');
      ctx.fillStyle = 'rgba(232,228,212,0.9)';
      ctx.font = 'bold 12px Consolas, monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`${Math.round(d)} u`, rx, ry + 20);
    } else if (d > BOARD_RANGE + 30) {
      drawChevron(ctx, sx, sy, Math.atan2(goal.y - p.y, goal.x - p.x), T.stage === 'pickup' ? '#ffd977' : '#7bffd4');
    }
  };

  function drawChevron(ctx, x, y, ang, color) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(ang);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(14, 0); ctx.lineTo(-8, 9); ctx.lineTo(-3, 0); ctx.lineTo(-8, -9);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  return T;
}
