// Vice Palms — the player: on-foot movement, carjacking, three guns, health.

import { PLAYER, KEYS, WEAPONS } from './config.js';
import { nearestCar, updateCarPhysics } from './cars.js';
import { circleResolve } from './world.js';
import { tryBoardTrain, exitTrain } from './train.js';
import { makePed } from './peds.js';
import { clamp, dist } from './util.js';

let game_ref = null;
export function attachPlayerGame(game) {
  game_ref = game;
}

export function makePlayer(x, y) {
  const pl = {
    x, y,
    h: -Math.PI / 2,
    aim: -Math.PI / 2,
    hp: PLAYER.hp,
    armor: 0,
    money: 500,
    weapon: 1,                    // index into WEAPONS
    owned: [0, 1],                // owned weapon ids
    ammo: { 1: 40, 2: 0, 3: 0 },  // per-weapon ammo pools
    inCar: null,
    riding: false,                // riding the Palm Metro
    shootT: 0,
    hurtT: 0,
    dead: false,
    walkPhase: 0,

    hurt(n, src) {
      if (pl.dead) return;
      if (pl.armor > 0) {
        const absorbed = Math.min(pl.armor, n * 0.65);
        pl.armor -= absorbed;
        n -= absorbed;
      }
      pl.hp -= n;
      pl.hurtT = 0.35;
      if (game_ref && game_ref.input) game_ref.input.gpVibeT = Math.max(game_ref.input.gpVibeT, 0.25);
      if (pl.hp <= 0) {
        pl.hp = 0;
        pl.dead = true;
        if (game_ref) game_ref.gameOver('wasted');
      }
    },
  };
  return pl;
}

/** Cycle to the next owned weapon. */
export function cycleWeapon(game) {
  const p = game.player;
  const idx = p.owned.indexOf(p.weapon);
  p.weapon = p.owned[(idx + 1) % p.owned.length];
  game.subtitle(WEAPONS[p.weapon].name, 1);
}

/** Buy from the Ammu-Nation marker is handled by game.playerShop(). */

/** Enter/exit cars, board the metro. */
export function tryEnterExit(game) {
  const p = game.player;
  if (p.riding) {
    exitTrain(game);
    return;
  }
  if (p.inCar) {
    const c = p.inCar;
    if (Math.abs(c.speed) > 140) return; // too fast to bail
    const side = c.h + Math.PI / 2;
    let ex = c.x + Math.cos(side) * (c.spec.w * 0.5 + 14);
    let ey = c.y + Math.sin(side) * (c.spec.w * 0.5 + 14);
    const res = circleResolve(game.world, ex, ey, PLAYER.r);
    ex = res.x;
    ey = res.y;
    p.x = ex;
    p.y = ey;
    p.inCar = null;
    if (c.role === 'player') c.role = 'parked';
    p.h = c.h;
    game.audio.engine(false, 0);
    return;
  }
  if (tryBoardTrain(game)) return;
  const c = nearestCar(game, p.x, p.y, PLAYER.enterDist);
  if (!c || c.dead) return;
  const wasAI = c.role === 'traffic' || (c.role === 'police' && c.ai);
  c.role = 'player';
  c.ai = null;
  c.throttle = 0;
  c.steer = 0;
  c.handbrake = false;
  p.inCar = c;
  if (wasAI) {
    // carjack! the driver bails and flees
    const d = makePed(c.x - Math.cos(c.h) * 20, c.y - Math.sin(c.h) * 20, 'civ');
    d.state = 'flee';
    d.t = 6;
    d.h = Math.atan2(d.y - p.y, d.x - p.x);
    game.peds.push(d);
    game.addCrime(1.3);
    game.subtitle('Carjacked!', 1.4);
    game.input.gpVibeT = Math.max(game.input.gpVibeT, 0.2);
  }
}

/** Fire the current weapon (on foot or drive-by). */
export function playerShoot(game) {
  const p = game.player;
  if (p.shootT > 0) return;
  const W = WEAPONS[p.weapon];

  if (W.melee) {
    p.shootT = W.rate;
    const mx = p.x + Math.cos(p.aim) * W.range * 0.7;
    const my = p.y + Math.sin(p.aim) * W.range * 0.7;
    game.spark(mx, my, 2, null);
    for (const q of game.peds) {
      if (q.state === 'down') continue;
      if (dist(q.x, q.y, mx, my) < 20) {
        game.peds.knock(q, Math.cos(p.aim) * 80, Math.sin(p.aim) * 80, 'fist');
        game.addCrime(1);
        break;
      }
    }
    const c = nearestCar(game, mx, my, 26);
    if (c && c !== p.inCar) {
      c.hp -= W.dmg;
      game.spark(mx, my, 3, null);
    }
    game.audio.blip(140, 0.08, 'square', 0.1, 70);
    return;
  }

  if ((p.ammo[p.weapon] || 0) <= 0) {
    game.audio.blip(220, 0.05, 'square', 0.06);
    p.shootT = 0.25;
    return;
  }
  p.shootT = W.rate;
  p.ammo[p.weapon] -= 1;

  const ox = p.inCar ? p.inCar.x : p.x;
  const oy = p.inCar ? p.inCar.y : p.y;
  const off = p.inCar ? p.inCar.spec.w * 0.6 : 10;
  for (let k = 0; k < W.pellets; k++) {
    const a = p.aim + (Math.random() - 0.5) * W.spread * 2;
    game.addBullet(ox + Math.cos(a) * off, oy + Math.sin(a) * off, a, 'player', W.range);
  }
  game.audio.gunshot();
  game.spark(ox + Math.cos(p.aim) * (off + 8), oy + Math.sin(p.aim) * (off + 8), 3, null);
  game.peds.flee(ox, oy, 340);
  game.trafficPanic(ox, oy, 300);
  if (game.police.wanted === 0 && Math.random() < 0.6) game.addCrime(1);
  else if (game.police.wanted > 0) game.addCrime(0.3);
  game.cam.shake = Math.min(5, game.cam.shake + (W.id === 3 ? 3.4 : 1.6));
  if (p.weapon === 3) game.input.gpVibeT = Math.max(game.input.gpVibeT, 0.18);
}

/** Per-frame player update. */
export function updatePlayer(game, dt) {
  const p = game.player;
  const inp = game.input;
  p.shootT -= dt;
  p.hurtT -= dt;

  if (inp.pressed(KEYS.enter)) tryEnterExit(game);
  if (inp.pressed(KEYS.weapon)) cycleWeapon(game);

  const W = WEAPONS[p.weapon];
  const wantFire = W.auto ? (inp.down(KEYS.shoot) || inp.mouse.down || inp.gpDown('shoot'))
    : (inp.pressed(KEYS.shoot) || inp.mouse.clicked || inp.gpPressed.has(2) || inp.gpPressed.has(7));
  if (wantFire) playerShoot(game);

  if (p.riding) {
    // riding the metro: F exits (handled above); nothing else to do
    return;
  }

  if (p.inCar) {
    const c = p.inCar;
    const ax = inp.axis();
    c.throttle = -ax.y;
    c.steer = ax.x;
    c.handbrake = inp.down(KEYS.handbrake) || inp.gpDown('handbrake');
    updateCarPhysics(game, c, dt, game.gripK);
    const wx = game.cam.x + (inp.mouse.x - 640);
    const wy = game.cam.y + (inp.mouse.y - 360);
    p.aim = Math.atan2(wy - c.y, wx - c.x);
    p.x = c.x;
    p.y = c.y;
    p.h = c.h;
    game.stats.distance += Math.abs(c.speed) * dt;
    return;
  }

  // --- on foot
  const ax = inp.axis();
  const sprint = (inp.down(KEYS.sprint) || inp.gpDown('sprint')) && (ax.x || ax.y);
  const sp = sprint ? PLAYER.sprint : PLAYER.walk;
  if (ax.x || ax.y) {
    const mx = ax.x * sp * dt;
    const my = ax.y * sp * dt;
    const res = circleResolve(game.world, p.x + mx, p.y + my, PLAYER.r);
    p.x = res.x;
    p.y = res.y;
    p.h = Math.atan2(my, mx);
    p.walkPhase += dt * (sprint ? 14 : 9);
  }
  p.x = clamp(p.x, 80, game.world.size - 80);
  p.y = clamp(p.y, 80, game.world.size - 80);

  // aim toward mouse (screen -> world)
  const wx = game.cam.x + (inp.mouse.x - 640);
  const wy = game.cam.y + (inp.mouse.y - 360);
  p.aim = Math.atan2(wy - p.y, wx - p.x);
}
