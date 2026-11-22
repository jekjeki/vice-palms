// Street racing: three authored circuits running on the city's public roads, a
// countdown, rival racers driving the same arcade car physics Rico does, live
// standings, cash prizes and best-lap records kept in localStorage. The Airfield GP
// circles the Palms Airfield fence; the Strip Sprint works the beachfront; the
// Downtown 500 threads the older blocks.
//
// Races never invent roads: every waypoint sits on a grid intersection, so the
// circuits read on the minimap exactly as they drive.

import { PITCH, GRID, CARS } from '../config.js';
import { Car } from '../entities/car.js';
import { clamp, TAU, turnDelta, dist2, lerp } from '../util.js';
import { rand, chance } from '../rng.js';

const CP_RADIUS = 150;          // checkpoint capture radius
const GRID_SLOT = 74;           // lateral spacing on the start grid

const CIRCUITS = [
  {
    id: 'airfield',
    name: 'AIRFIELD GP',
    blurb: 'Two flat laps around the Palms Airfield fence. Long straights, four real corners.',
    laps: 2,
    prize: [1800, 900, 450, 200],
    points: [[2, 2], [7, 2], [7, 4], [7, 6], [2, 6], [2, 4]],
    specs: [1, 5, 9],            // Vanta, Roadmaster, Howler
  },
  {
    id: 'strip',
    name: 'STRIP SPRINT',
    blurb: 'Down the neon beachfront and back through the cross streets. Traffic is heavy.',
    laps: 2,
    prize: [1500, 750, 350, 150],
    points: [[38, 3], [38, 13], [35, 13], [32, 13], [32, 3], [35, 3]],
    specs: [0, 8, 9],            // Flamingo, Lagoon, Howler
  },
  {
    id: 'downtown',
    name: 'DOWNTOWN 500',
    blurb: 'Three tight laps through the older blocks. Brakes win this one, not horsepower.',
    laps: 3,
    prize: [2400, 1200, 600, 250],
    points: [[14, 18], [26, 18], [26, 24], [20, 27], [14, 24]],
    specs: [5, 9, 1],            // Roadmaster, Howler, Vanta
  },
];

const ORDINALS = ['1st', '2nd', '3rd', '4th'];

// The regular grid: named drivers with a line of patter each. The field feels
// like a scene when the results board reads people, not model names.
const DRIVERS = [
  { name: 'REYES', trim: '#e0487a', bark: 'You got lucky and you know it.' },
  { name: 'KANTO', trim: '#19c6d8', bark: 'Rematch. Same line. I want the apex.' },
  { name: 'MOMO',  trim: '#9ade6a', bark: 'My mechanic heard that engine and laughed.' },
  { name: 'VEX',   trim: '#f2cf47', bark: 'The Strip belongs to me. Ask literally anyone.' },
  { name: 'JUNO',  trim: '#8a5cd6', bark: 'I bowled a perfect corner and still lost. Rude.' },
  { name: 'BOLT',  trim: '#ff7a3c', bark: 'Fuel, tyres, no fear. That is the whole plan.' },
];

function bestKey(id) { return `vicepalms.bestlap.${id}`; }

function readBest(id) {
  try { return Number(localStorage.getItem(bestKey(id))) || null; } catch { return null; }
}
function writeBest(id, t) {
  try { localStorage.setItem(bestKey(id), t.toFixed(2)); } catch { /* private mode */ }
}

export function createRaces(game) {
  const R = {
    game,
    circuits: CIRCUITS.map((c, i) => ({
      ...c,
      index: i,
      wps: c.points.map(([i2, j2]) => ({ x: i2 * PITCH, y: j2 * PITCH })),
      start: {
        x: c.points[0][0] * PITCH,
        y: c.points[0][1] * PITCH,
        ang: Math.atan2(
          c.points[1][1] * PITCH - c.points[0][1] * PITCH,
          c.points[1][0] * PITCH - c.points[0][0] * PITCH,
        ),
      },
      best: readBest(c.id),
    })),
    mode: 'idle',            // idle | count | run | done
    circuit: null,
    player: null,            // the Car Rico brought
    rivals: [],
    countT: 0,
    raceT: 0,
    lapT: 0,
    playerWp: 1,
    playerLap: 1,
    doneT: 0,
    results: [],
    leaveT: 0,
    banner: null,
    bannerT: 0,
    wrongWayT: 0,
  };

  // ------------------------------------------------------------ helpers

  const nearestCircuit = (p) => {
    let best = null, bd = 190 * 190;
    for (const c of R.circuits) {
      const d = dist2(c.start.x, c.start.y, p.x, p.y);
      if (d < bd) { bd = d; best = c; }
    }
    return best;
  };

  const say = (text, color) => game.toast(text, color);

  /** Perpendicular unit vector of a heading. */
  const perp = (ang) => ({ x: -Math.sin(ang), y: Math.cos(ang) });

  // ------------------------------------------------------------ lifecycle

  R.tryInteract = function (p) {
    if (R.mode === 'idle' || R.mode === 'done') {
      const c = nearestCircuit(p);
      if (!c) return false;
      if (!p.car) { say('Bring a car to the start line to race.', '#ffd977'); return true; }
      if (p.car.wreck || p.car.wasted) return false;
      R.begin(c, p);
      return true;
    }
    return false;
  };

  R.begin = function (c, p) {
    R.circuit = c;
    R.player = p.car;
    R.mode = 'count';
    R.countT = 3.9;
    R.raceT = 0;
    R.lapT = 0;
    R.playerWp = 1;
    R.playerLap = 1;
    R.results = [];
    R.leaveT = 0;
    R.bannerT = 0;
    game.audio.ensure();

    // Slot the player and the rivals onto the start grid: two side-by-side
    // columns staggered back, all four inside the road width.
    const s = c.start;
    const dir = perp(s.ang);
    const slots = [];
    for (let k = 0; k < 4; k++) {
      const lat = (k % 2 ? 1 : -1) * 24;
      const back = Math.floor(k / 2) * 130 + 20;
      slots.push({ x: s.x + dir.x * lat - Math.cos(s.ang) * back, y: s.y + dir.y * lat - Math.sin(s.ang) * back });
    }
    // Rico always gets the pole slot; shuffle the rest.
    R.player.x = slots[0].x; R.player.y = slots[0].y;
    R.player.ang = s.ang;
    R.player.vx = 0; R.player.vy = 0; R.player.fwd = 0;
    R.player.gas = 0; R.player.brake = 0; R.player.steer = 0; R.player.slide = false;
    R.player.role = 'player';

    R.rivals = [];
    for (let k = 0; k < 3; k++) {
      const specIndex = c.specs[k % c.specs.length];
      const driver = DRIVERS[(c.index * 3 + k) % DRIVERS.length];
      const v = new Car(specIndex, slots[k + 1].x, slots[k + 1].y, s.ang);
      v.role = 'racer';
      v.tag = 'racer';
      v.driver = driver.name;
      v.trim = driver.trim;
      v.hp = v.spec.hp;
      v.cruise = 250 + rand() * 40;
      v.slot = k;
      v.wp = 1;
      v.lap = 1;
      v.finished = 0;
      v.boost = 1;
      v.wobble = rand() * TAU;
      game.cars.push(v);
      R.rivals.push(v);
    }
    R.banner = `RACE: ${c.name}`;
    R.bannerT = 2.6;
    const grid = R.rivals.map((v) => v.driver).join(', ');
    say(`${c.name} — ${c.laps} laps, win ${c.prize[0]}. Grid: ${grid}.`, '#ffd977');
  };

  function cleanUp() {
    for (const v of R.rivals) {
      const at = game.cars.indexOf(v);
      if (at >= 0) game.cars.splice(at, 1);
    }
    R.rivals = [];
    R.player = null;
  }

  function fail(reason) {
    R.mode = 'done';
    R.doneT = 2.6;
    R.results = null;
    R.banner = 'RACE OVER';
    R.bannerT = 2.4;
    say(reason, '#ff7a3c');
  }

  function finish(order) {
    R.mode = 'done';
    R.doneT = 5.4;
    const place = order.indexOf(R.player);
    const prize = place >= 0 && place < 4 ? R.circuit.prize[place] : 0;
    R.results = { order, place, prize, time: R.raceT, lapTimes: R.lastLap ?? null };
    if (prize > 0) {
      game.player.money += prize;
      say(`${ORDINALS[place]} place — $${prize} prize.`, '#7bffd4');
    } else {
      say(`${ORDINALS[Math.min(3, place)]} place — no purse.`, '#ff7a3c');
    }
    const lap = R.lastLap;
    if (lap && (!R.circuit.best || lap < R.circuit.best)) {
      R.circuit.best = lap;
      writeBest(R.circuit.id, lap);
      say(`NEW BEST LAP: ${lap.toFixed(2)}s`, '#33e7ff');
    }
  }

  // ------------------------------------------------------------ update

  R.update = function (dt, p) {
    R.bannerT = Math.max(0, R.bannerT - dt);

    if (R.mode === 'idle' || R.mode === 'done') {
      // Doorstep prompt while the player idles near a start line.
      if (R.mode === 'idle' && !p.car) {
        const c = nearestCircuit(p);
        if (c && game.hud) game.hud.setPrompt('E — RACE: ' + c.name);
      }
      if (R.mode === 'done') {
        R.doneT -= dt;
        if (R.doneT <= 0) { R.mode = 'idle'; cleanUp(); R.circuit = null; }
      }
      return;
    }

    if (R.mode === 'count') {
      R.countT -= dt;
      // Hold everything motionless on the grid until the lights go green.
      holdAt(R.player, R.circuit.start.ang);
      for (const v of R.rivals) holdAt(v, R.circuit.start.ang);
      const prev = Math.ceil(R.countT + dt);
      const now = Math.ceil(R.countT);
      if (now !== prev && now >= 1 && now <= 3) game.audio.blip(520);
      if (R.countT <= 0) {
        R.mode = 'run';
        game.audio.blip(920);
        say('GREEN LIGHT — GO', '#7bffd4');
      }
      return;
    }

    // -------------------------------------------------- running
    R.raceT += dt;
    R.lapT += dt;

    // Abandonment: no ride, or a ride that is clearly leaving the event.
    if (!p.car || p.car.wreck || p.car.wasted) {
      R.leaveT += dt;
      if (R.leaveT > 1.4) { fail('You abandoned the race.'); cleanUp(); return; }
    } else R.leaveT = 0;

    // Player checkpoint chase.
    advanceRacer(R.player, R, p, dt, true);

    // Rival AI + physics.
    for (const v of R.rivals) {
      rivalDrive(v, dt);
      v.drive(dt, game);
      rivalProgress(v);
      if (!v.finished && v.lap > R.circuit.laps) {
        v.finished = R.raceT;
      }
    }

    // Soft separation so the grid never turns into one car.
    separate(dt);

    // Finish order: everyone who has completed the laps, best progress first.
    if (p && R.playerLap > R.circuit.laps && R.mode === 'run') {
      const order = [];
      const pool = [R.player, ...R.rivals];
      for (const v of pool) {
        if (v === R.player) continue;
        if (v.lap > R.circuit.laps) order.push({ v, t: v.finished ?? R.raceT });
      }
      order.sort((a, b) => a.t - b.t);
      // Rico's finish time is now; rivals ahead of him placed better.
      const ahead = order.filter((o) => o.t <= R.raceT).length;
      const place = ahead;
      R.mode = 'done';
      R.doneT = 5.4;
      const prize = place < 4 ? R.circuit.prize[place] : 0;
      R.results = { place, prize, time: R.raceT };
      if (prize > 0) {
        game.player.money += prize;
        say(`${ORDINALS[place]} place — $${prize} prize.`, '#7bffd4');
      } else say(`${ORDINALS[Math.min(3, place)]} place — no purse.`, '#ff7a3c');
      const lap = R.lastLap;
      if (lap && (!R.circuit.best || lap < R.circuit.best)) {
        R.circuit.best = lap;
        writeBest(R.circuit.id, lap);
        say(`NEW BEST LAP: ${lap.toFixed(2)}s`, '#33e7ff');
      }
      game.audio.blip(760);
    }

    // Rivals all done and Rico parked: the race dissolves.
    if (R.mode === 'run') {
      const alive = R.rivals.filter((v) => !v.finished).length;
      if (alive === 0 && !p.car) fail('The field finished without you.');
    }
  };

  function holdAt(v, ang) {
    v.vx = 0; v.vy = 0; v.fwd = 0;
    v.gas = 0; v.brake = 0; v.steer = 0; v.slide = false;
    v.ang = ang;
  }

  /** Sequential waypoint capture shared by Rico and the rivals. */
  function advanceRacer(v, R, p, dt, isPlayer) {
    const wps = R.circuit.wps;
    const wp = wps[v === R.player ? R.playerWp : v.wp];
    const d = Math.hypot(wp.x - v.x, wp.y - v.y);
    if (d < CP_RADIUS) {
      const next = (v === R.player ? R.playerWp : v.wp) + 1;
      if (next >= wps.length) {
        // Lap complete: the lap timer banks and the count rolls over.
        if (isPlayer) {
          R.lastLap = R.lapT;
          R.lapT = 0;
          R.playerLap++;
          if (R.playerLap <= R.circuit.laps) {
            say(`LAP ${R.playerLap - 1} — ${R.lastLap.toFixed(2)}s`, '#33e7ff');
            game.audio.blip(660);
          }
        } else v.lap++;
        v === R.player ? (R.playerWp = 0) : (v.wp = 0);
      } else {
        if (isPlayer) R.playerWp = next;
        else v.wp = next;
      }
    }
  }

  function rivalProgress(v) {
    advanceRacer(v, R, game.player, 0, false);
  }

  function rivalDrive(v, dt) {
    const c = R.circuit;
    const wps = c.wps;
    const wp = wps[v.wp];
    // Pure pursuit on the current gate; once it is close, blend the aim point
    // into the next segment so the car takes the corner from the inside.
    let aim = { x: wp.x, y: wp.y };
    const d = Math.hypot(wp.x - v.x, wp.y - v.y);
    if (d < 340) {
      const aheadWp = wps[(v.wp + 1) % wps.length];
      const t = (1 - d / 340) * 0.45;
      aim.x = lerp(wp.x, aheadWp.x, t);
      aim.y = lerp(wp.y, aheadWp.y, t);
    }
    aim.x += Math.cos(v.wobble) * 5;
    aim.y += Math.sin(v.wobble) * 5;
    const ang = Math.atan2(aim.y - v.y, aim.x - v.x);
    const delta = turnDelta(v.ang, ang);
    v.steer = clamp(delta / 0.55, -1, 1);

    const speed = Math.hypot(v.vx, v.vy);
    const corner = Math.abs(delta);
    v.gas = corner < 0.85 ? 1 : 0;
    v.brake = corner > 1.15 && speed > 210 ? 1 : 0;
    v.slide = corner > 1.5 && speed > 240;

    // Unstick reflex: wedged against a prop (a plane, a parked car, the tower)
    // the rival backs off and swings its nose before resuming the line.
    if (speed < 42 && v.gas > 0) v.stuckT = (v.stuckT ?? 0) + dt;
    else v.stuckT = 0;
    if (v.stuckT > 1.1) {
      v.stuckT = 0;
      v.unstickT = 0.85;
      v.unstickSteer = v.steer >= 0 ? -1 : 1;
    }
    if ((v.unstickT ?? 0) > 0) {
      v.unstickT -= dt;
      v.gas = 0;
      v.brake = 1;
      v.steer = v.unstickSteer;
    }

    // Rubber band: stragglers get a motor boost, leaders coast a little.
    const myProg = v.lap * 1000 + v.wp * 100;
    const plProg = R.playerLap * 1000 + R.playerWp * 100;
    v.boost = lerp(v.boost, 1 + clamp((plProg - myProg) * 0.0012, -0.1, 0.16), Math.min(1, dt * 2));
    if (speed > v.spec.top * v.boost) v.gas = 0;
    if (v.wreck) { v.gas = 0; v.brake = 0; }
  }

  function separate(dt) {
    const all = [R.player, ...R.rivals];
    for (let i = 0; i < all.length; i++) {
      for (let j = i + 1; j < all.length; j++) {
        const a = all[i], b = all[j];
        if (!a || !b || a.wreck || b.wreck) continue;
        const dx = b.x - a.x, dy = b.y - a.y;
        const d = Math.hypot(dx, dy) || 1;
        const min = (a.radius + b.radius) * 0.82;
        if (d < min) {
          const push = (min - d) * 0.4;
          a.x -= (dx / d) * push; a.y -= (dy / d) * push;
          b.x += (dx / d) * push; b.y += (dy / d) * push;
        }
      }
    }
  }

  // ------------------------------------------------------------ markers + world draw

  /** Idle start pads show as markers for the HUD blips. */
  R.marker = function () {
    if (R.mode === 'count' || R.mode === 'run') return null;
    const c = nearestCircuit(game.player);
    return c ? { x: c.start.x, y: c.start.y, color: '#ffd977', kind: 'race' } : null;
  };

  /** World pass: the start gantry and the live checkpoint gate. */
  R.drawWorld = function (ctx, view) {
    const c = R.circuit;
    if (!c && R.mode === 'idle') {
      // Parked start lines for every circuit near the camera.
      for (const cc of R.circuits) {
        const s = cc.start;
        if (s.x < view.x0 - 200 || s.x > view.x1 + 200 || s.y < view.y0 - 200 || s.y > view.y1 + 200) continue;
        drawGantry(ctx, s, '#ffd977');
      }
      return;
    }
    if (!c) return;
    const s = c.start;
    if (s.x > view.x0 - 300 && s.x < view.x1 + 300 && s.y > view.y0 - 300 && s.y < view.y1 + 300) {
      drawGantry(ctx, s, '#ffd977');
    }
    if (R.mode === 'run' || R.mode === 'count') {
      const wp = c.wps[R.playerWp];
      const pulse = 0.5 + 0.5 * Math.sin(game.time * 5);
      ctx.strokeStyle = `rgba(123,255,212,${0.35 + pulse * 0.4})`;
      ctx.lineWidth = 6;
      ctx.beginPath(); ctx.arc(wp.x, wp.y, CP_RADIUS, 0, TAU); ctx.stroke();
      ctx.strokeStyle = `rgba(123,255,212,${0.5 + pulse * 0.3})`;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(wp.x, wp.y, CP_RADIUS - 16, 0, TAU); ctx.stroke();
      // Flag dots on the rim.
      ctx.fillStyle = '#e8e4d4';
      for (let k = 0; k < 8; k++) {
        const a2 = (k / 8) * TAU + game.time * 0.8;
        ctx.beginPath();
        ctx.arc(wp.x + Math.cos(a2) * (CP_RADIUS - 6), wp.y + Math.sin(a2) * (CP_RADIUS - 6), 4, 0, TAU);
        ctx.fill();
      }
    }
  };

  function drawGantry(ctx, s, color) {
    const dir = perp(s.ang);
    const ex = dir.x * 120, ey = dir.y * 120;
    // Two posts and a banner across the road.
    ctx.fillStyle = '#3d4148';
    ctx.fillRect(s.x + ex - 8, s.y + ey - 8, 16, 16);
    ctx.fillRect(s.x - ex - 8, s.y - ey - 8, 16, 16);
    ctx.strokeStyle = color;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(s.x + ex, s.y + ey);
    ctx.lineTo(s.x - ex, s.y - ey);
    ctx.stroke();
    // Chequer strip along the banner.
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.rotate(s.ang + Math.PI / 2);
    for (let k = 0; k < 12; k++) {
      ctx.fillStyle = k % 2 ? '#25272e' : '#e8e4d4';
      ctx.fillRect(-120 + k * 20, -4, 20, 8);
    }
    ctx.restore();
  }

  // ------------------------------------------------------------ HUD

  /** Panel drawn by hud.js while a race is live or finishing. */
  R.drawHud = function (ctx, W, H) {
    const c = R.circuit;
    if (!c) return;

    if (R.mode === 'count') {
      const n = Math.ceil(R.countT);
      const frac = R.countT - Math.floor(R.countT);
      ctx.save();
      ctx.textAlign = 'center';
      ctx.font = `bold ${96 + Math.sin(frac * Math.PI) * 26}px Consolas, monospace`;
      ctx.fillStyle = n <= 1 ? 'rgba(123,255,212,0.95)' : 'rgba(255,217,119,0.95)';
      ctx.fillText(n >= 1 ? String(n) : 'GO', W / 2, H * 0.4);
      ctx.font = 'bold 18px Consolas, monospace';
      ctx.fillStyle = 'rgba(232,228,212,0.8)';
      ctx.fillText(c.name, W / 2, H * 0.4 + 44);
      ctx.restore();
      return;
    }

    if (R.mode === 'run') {
      // Standings: everyone sorted by laps then waypoints then distance.
      const pool = [R.player, ...R.rivals].map((v) => {
        const wp = c.wps[v === R.player ? R.playerWp : v.wp];
        const d = Math.hypot(wp.x - v.x, wp.y - v.y);
        return { v, lap: v === R.player ? R.playerLap : v.lap, wp: v === R.player ? R.playerWp : v.wp, d };
      });
      pool.sort((a, b) => (b.lap - a.lap) || (b.wp - a.wp) || (a.d - b.d));
      const place = pool.findIndex((e) => e.v === R.player);

      ctx.save();
      // Top-centre race plate.
      const pw = 300;
      ctx.fillStyle = 'rgba(5,7,15,0.72)';
      ctx.beginPath();
      ctx.roundRect ? ctx.roundRect(W / 2 - pw / 2, 16, pw, 64, 10) : ctx.rect(W / 2 - pw / 2, 16, pw, 64);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,217,119,0.5)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect ? ctx.roundRect(W / 2 - pw / 2, 16, pw, 64, 10) : ctx.rect(W / 2 - pw / 2, 16, pw, 64);
      ctx.stroke();
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ffd977';
      ctx.font = 'bold 17px Consolas, monospace';
      ctx.fillText(`${ORDINALS[Math.min(3, place)]} of 4  —  LAP ${Math.min(R.playerLap, c.laps)}/${c.laps}`, W / 2, 40);
      ctx.fillStyle = '#e8e4d4';
      ctx.font = 'bold 15px Consolas, monospace';
      ctx.fillText(`TIME ${R.raceT.toFixed(1)}s   LAP ${R.lapT.toFixed(1)}s`, W / 2, 62);
      ctx.fillStyle = 'rgba(232,228,212,0.55)';
      ctx.font = '12px Consolas, monospace';
      ctx.fillText(`BEST ${c.best ? c.best.toFixed(2) + 's' : '—'}`, W / 2, 76);
      ctx.restore();
    }

    if (R.mode === 'done' && R.results) {
      ctx.save();
      ctx.textAlign = 'center';
      const y = H * 0.34;
      ctx.fillStyle = 'rgba(5,7,15,0.6)';
      ctx.fillRect(0, y - 44, W, 88);
      ctx.fillStyle = '#ffd977';
      ctx.font = 'bold 34px Consolas, monospace';
      ctx.fillText(`${ORDINALS[Math.min(3, R.results.place)]} PLACE`, W / 2, y);
      ctx.fillStyle = R.results.prize > 0 ? '#7bffd4' : '#ff7a3c';
      ctx.font = 'bold 20px Consolas, monospace';
      ctx.fillText(R.results.prize > 0 ? `+$${R.results.prize}` : 'no purse', W / 2, y + 28);
      // The grid reads people, not model names: final standings with trims.
      ctx.textAlign = 'left';
      ctx.font = 'bold 13px Consolas, monospace';
      const list = [null, ...R.rivals].map((v, i) => ({
        i,
        name: v ? v.driver : 'RICO',
        trim: v ? v.trim : '#e9ecf4',
        lap: v ? v.lap : R.playerLap,
        wp: v ? v.wp : R.playerWp,
      })).sort((a, b) => (b.lap - a.lap) || (b.wp - a.wp));
      list.forEach((row, k) => {
        const ry = y + 58 + k * 20;
        ctx.fillStyle = row.trim;
        ctx.fillRect(W / 2 - 150, ry - 10, 4, 13);
        ctx.fillStyle = k === R.results.place ? '#7bffd4' : 'rgba(232,228,212,0.8)';
        ctx.fillText(`${ORDINALS[k]}  ${row.name}`, W / 2 - 138, ry);
      });
      // The beaten driver has something to say about it.
      const beaten = R.rivals[(R.results.place + 3) % 3];
      if (beaten) {
        const bark = DRIVERS.find((d) => d.name === beaten.driver)?.bark;
        if (bark) {
          ctx.textAlign = 'center';
          ctx.fillStyle = 'rgba(232,228,212,0.65)';
          ctx.font = '12px Consolas, monospace';
          ctx.fillText(`${beaten.driver}: “${bark}”`, W / 2, y + 160);
        }
      }
      ctx.restore();
    }
  };

  return R;
}
