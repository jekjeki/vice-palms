// ============================================================
// GANGS — the two crews that split the North Docks between them.
//
//   The Tides (crimson) hold the west water; The Cinders (blue)
//   run the east yards. Territory heat per block rises as
//   trouble lands, turf skirmishes erupt that Rico can join or
//   drive past, drive-bys roll through rival blocks, loyalty is
//   earned at each hideout door and remembered in the save.
// ============================================================

import { dist2, clamp } from '../util.js';
import { rand, randInt } from '../rng.js';
import { PITCH, SPAN } from '../config.js';
import { DOCKS_WATER_Y } from '../world/district.js';
import { Person } from '../entities/person.js';

export const GANGS = {
  tides: {
    id: 'tides',
    name: 'The Tides',
    color: '#ff5533',
    motto: 'The water takes everything back.',
    hideout: 'Tides Boathouse',
  },
  cinders: {
    id: 'cinders',
    name: 'The Cinders',
    color: '#33aaff',
    motto: 'Burn it clean. Sell it dear.',
    hideout: 'Cinder Yard Locker',
  },
};

const SKIRMISH_INTERVAL = [70, 130];
const DRIVEBY_INTERVAL = [55, 110];
const HEAT_DECAY = 0.02;         // per second
const SKIRMISH_RADIUS = 300;
const SKIRMISH_LIFETIME = 42;

function other(g) { return g === 'tides' ? 'cinders' : 'tides'; }

// ------------------------------------------------------------
export function createGangs(game, district) {
  const state = {
    loyalty: { tides: 0, cinders: 0 },
    heat: [],                 // 6x6 block grid of per-gang heat
    skirmish: null,
    driveBy: null,
    nextSkirmish: rr(...SKIRMISH_INTERVAL),
    nextDriveBy: rr(...DRIVEBY_INTERVAL),
    activeGang: null,
    skirmishesWon: { tides: 0, cinders: 0 },
    totalSkirmishes: 0,
    weaponGiven: false,
  };

  const GRID_N = 6;
  for (let gy = 0; gy < GRID_N; gy++) {
    const row = [];
    for (let gx = 0; gx < GRID_N; gx++) row.push({ tides: 0, cinders: 0 });
    state.heat.push(row);
  }

  const b = district.bounds;
  const cellW = (b.x1 - b.x0) / GRID_N;
  const cellH = (b.y1 - b.y0) / GRID_N;

  function rr(a, b2) { return a + Math.random() * (b2 - a); }

  function gangAt(x, y) {
    if (y < DOCKS_WATER_Y || y > 0) return null;
    return x < SPAN / 2 ? 'tides' : 'cinders';
  }

  function heatCell(x, y) {
    const gx = clamp(Math.floor((x - b.x0) / cellW), 0, GRID_N - 1);
    const gy = clamp(Math.floor((y - b.y0) / cellH), 0, GRID_N - 1);
    return state.heat[gy][gx];
  }

  function addHeat(x, y, gang, amount) {
    if (y < DOCKS_WATER_Y || y > 0) return;
    heatCell(x, y)[gang] = clamp(heatCell(x, y)[gang] + amount, 0, 1);
  }

  function inDocks(x, y) {
    return x > b.x0 - 60 && x < b.x1 + 60 && y > b.y0 - 60 && y < 0;
  }

  // ----------------------------------------------------------
  // Members: pedestrians in gang colors with extra grit.
  // ----------------------------------------------------------
  function spawnMember(gang, x, y, opts = {}) {
    const p = new Person(x, y, randInt(9999) * 7 + 3);
    p.shirt = GANGS[gang].color;
    p.gang = gang;
    p.isGang = true;
    p.hp = 55;
    p.speed *= 1.12;
    game.people.push(p);
    return p;
  }

  function membersAlive(list, gang) {
    let n = 0;
    for (const m of list) {
      if (m.gang !== gang) continue;
      if (m.mode === 'down') continue;
      n++;
    }
    return n;
  }

  // ----------------------------------------------------------
  // Turf skirmishes: two squads square off; join with E nearby.
  // ----------------------------------------------------------
  function startSkirmish() {
    // Spawn near the turf boundary so both sides have a reason to fight.
    const x = SPAN / 2 + (rand() - 0.5) * 900;
    const y = DOCKS_WATER_Y + 200 + rand() * (-DOCKS_WATER_Y - 400);
    const attacker = rand() < 0.5 ? 'tides' : 'cinders';
    const members = [];
    const n = 3 + randInt(3);
    for (let i = 0; i < n; i++) {
      members.push(spawnMember(attacker, x + (rand() - 0.5) * 240, y + (rand() - 0.5) * 200));
    }
    for (let i = 0; i < n; i++) {
      members.push(spawnMember(other(attacker), x + (rand() - 0.5) * 240, y + (rand() - 0.5) * 200));
    }
    state.skirmish = { x, y, attacker, members, t: 0, joined: false, joinedSide: null };
    state.totalSkirmishes++;
    game.dialog?.say?.('radio', `Turf war — ${GANGS[attacker].name} pushing into ${GANGS[other(attacker)].name} blocks.`);
    game.dialog?.mission('begin');
  }

  function skirmishFight(dt) {
    const s = state.skirmish;
    // Members close on the nearest enemy; shots ring out both ways.
    for (const m of s.members) {
      if (m.mode === 'down') continue;
      let best = null;
      let bestD = 1e12;
      for (const o of s.members) {
        if (o === m || o.mode === 'down') continue;
        if (o.gang === m.gang) continue;
        const d2 = dist2(m.x, m.y, o.x, o.y);
        if (d2 < bestD) { bestD = d2; best = o; }
      }
      if (!best) continue;
      // Close distance, then trade fire inside pistol range.
      if (bestD > 180 * 180) {
        m.tx = best.x; m.ty = best.y;
        m.mode = m.mode === 'bolt' ? 'stroll' : m.mode;
      } else {
        m.pauseT = 0.4;
        m.fireT = (m.fireT ?? rr(0.2, 1.4)) - dt;
        if (m.fireT <= 0) {
          m.fireT = rr(0.5, 1.6);
          const ang = Math.atan2(best.y - m.y, best.x - m.x) + (rand() - 0.5) * 0.3;
          game.bullets.fire(m.x + Math.cos(ang) * 14, m.y + Math.sin(ang) * 14, ang, 820, false, 9);
          game.audio?.shot?.(0.5);
        }
      }
    }
    s.t += dt;
  }

  function resolveSkirmish() {
    const s = state.skirmish;
    const tidesLeft = membersAlive(s.members, 'tides');
    const cindersLeft = membersAlive(s.members, 'cinders');
    const winner = tidesLeft > cindersLeft ? 'tides' : cindersLeft > tidesLeft ? 'cinders' : null;

    if (s.joined && dist2(game.player.x, game.player.y, s.x, s.y) < SKIRMISH_RADIUS * SKIRMISH_RADIUS) {
      const side = s.joinedSide;
      const helped = winner ? side === winner : side === other(s.attacker);
      if (helped) {
        state.loyalty[side] = clamp(state.loyalty[side] + 0.18, 0, 1);
        state.skirmishesWon[side]++;
        const pay = 350 + Math.floor(rand() * 250);
        game.player.money += pay;
        game.fx?.cash?.(game.player.x, game.player.y);
        game.dialog?.say?.('radio', `${GANGS[side].name} respect you now. +$${pay}.`);
      } else {
        state.loyalty[side] = clamp(state.loyalty[side] - 0.1, 0, 1);
        game.dialog?.say?.('radio', `That went badly for the ${GANGS[side].name}. They remember.`);
      }
      state.activeGang = side;
    }

    if (winner) {
      addHeat(s.x, s.y, other(winner), 0.35);
      addHeat(s.x, s.y, winner, -0.1);
    }
    // Bodies fade back into the street: downed members despawn on cleanup.
    for (const m of s.members) {
      const i = game.people.indexOf(m);
      if (i >= 0 && m.mode === 'down') game.people.splice(i, 1);
    }
    state.skirmish = null;
  }

  function tryJoinSkirmish() {
    const s = state.skirmish;
    if (!s || s.joined) return false;
    if (dist2(game.player.x, game.player.y, s.x, s.y) > SKIRMISH_RADIUS * SKIRMISH_RADIUS) return false;
    s.joined = true;
    const local = gangAt(game.player.x, game.player.y) ?? s.attacker;
    // Rico fights for the side whose block he is standing in, unless he
    // already runs with a crew whose turf is on the other side.
    s.joinedSide = state.activeGang && state.activeGang !== other(local) ? state.activeGang : local;
    game.dialog?.say?.('radio', `You're in it with the ${GANGS[s.joinedSide].name} now.`);
    return true;
  }

  // ----------------------------------------------------------
  // Drive-bys: a rival crew rolls through and opens fire.
  // ----------------------------------------------------------
  function startDriveBy() {
    const shooterGang = rand() < 0.5 ? 'tides' : 'cinders';
    const x = SPAN / 2 + (rand() - 0.5) * 1400;
    const y = DOCKS_WATER_Y + 150 + rand() * (-DOCKS_WATER_Y - 300);
    // The shooter rides in a car that screams past and shoots sideways.
    const car = game.spawnCar(randInt(10), x - 700, y, 0);
    car.role = 'traffic';
    car.axis = 'x';
    car.dir = 1;
    car.lane = y;
    car.fwd = 210;
    car.tag = 'driveby';
    const shooter = spawnMember(shooterGang, x - 700, y - 26);
    shooter.graceT = 2;
    shooter.inCar = car;
    state.driveBy = { gang: shooterGang, car, shooter, t: 0, life: 12, shotT: 0.6 };
    game.dialog?.say?.('radio', `Drive-by — ${GANGS[shooterGang].name} rolling on ${GANGS[other(shooterGang)].name} blocks.`);
  }

  function updateDriveBy(dt) {
    const db = state.driveBy;
    db.t += dt;
    db.life -= dt;
    db.shotT -= dt;
    // The shooter fires from the passenger window as the car passes.
    if (db.shotT <= 0 && !db.car.wasted) {
      db.shotT = rr(0.5, 1.2);
      const ang = -Math.PI / 2 + (rand() - 0.5) * 0.8;
      game.bullets.fire(db.car.x - 20, db.car.y - 20, ang, 780, false, 8);
      game.audio?.shot?.(0.4);
      addHeat(db.car.x, db.car.y, other(db.gang), 0.05);
      // Rico catches a round if he is close to the line of fire.
      if (dist2(game.player.x, game.player.y, db.car.x, db.car.y) < 130 * 130) {
        if (!game.player.car && rand() < 0.35) game.player.hit(5, db.car.x, db.car.y);
      }
    }
    if (db.life <= 0 || db.car.wasted) {
      if (db.shooter.mode !== 'down') {
        const i = game.people.indexOf(db.shooter);
        if (i >= 0) game.people.splice(i, 1);
      }
      state.driveBy = null;
    }
  }

  // ----------------------------------------------------------
  // Hideout doors: loyalty opens them.
  // ----------------------------------------------------------
  function nearestHideout(x, y) {
    let best = null;
    let bestD = 90 * 90;
    for (const h of district.hideouts) {
      const d2 = dist2(x, y, h.x, h.y);
      if (d2 < bestD) { bestD = d2; best = h; }
    }
    return best;
  }

  function enterHideout(hideout) {
    const gang = hideout.gang;
    const loy = state.loyalty[gang];
    if (loy < 0.25) {
      game.dialog?.say?.('radio', `${GANGS[gang].name}: "Wrong side of the water, friend. Come back with some loyalty."`);
      return;
    }
    game.player.health = Math.min(100, game.player.health + 35);
    if (rand() < 0.6) {
      const pay = 120 + Math.floor(loy * 400);
      game.player.money += pay;
      game.fx?.cash?.(game.player.x, game.player.y);
      game.dialog?.say?.('radio', `${GANGS[gang].name} cut you in: $${pay} for quiet work.`);
    }
    if (loy > 0.7 && !state.weaponGiven) {
      state.weaponGiven = true;
      game.player.weapon = 'pistol';
      game.player.ammo += 24;
      game.dialog?.say?.('radio', `${GANGS[gang].name} trust you now. The back locker is open — take the pistol.`);
    }
  }

  // ----------------------------------------------------------
  function update(dt, player) {
    // Heat cools block by block.
    for (const row of state.heat) {
      for (const cell of row) {
        if (cell.tides > 0) cell.tides = Math.max(0, cell.tides - HEAT_DECAY * dt);
        if (cell.cinders > 0) cell.cinders = Math.max(0, cell.cinders - HEAT_DECAY * dt);
      }
    }
    // Rico's own trouble heats the block he is standing in.
    if (game.wanted.stars > 0) {
      const g = gangAt(player.x, player.y);
      if (g) addHeat(player.x, player.y, g, dt * 0.012 * (1 + game.wanted.stars));
    }

    // Skirmish scheduling and resolution.
    if (!state.skirmish) {
      state.nextSkirmish -= dt;
      if (state.nextSkirmish <= 0) {
        state.nextSkirmish = rr(...SKIRMISH_INTERVAL);
        if (inDocks(player.x, player.y)) startSkirmish();
      }
    } else {
      skirmishFight(dt);
      const tidesAlive = membersAlive(state.skirmish.members, 'tides');
      const cindersAlive = membersAlive(state.skirmish.members, 'cinders');
      if (tidesAlive === 0 || cindersAlive === 0 || state.skirmish.t > SKIRMISH_LIFETIME) {
        resolveSkirmish();
      }
    }
    // Join prompt (only while a skirmish is still live).
    const sk = state.skirmish;
    if (sk && !sk.joined && dist2(player.x, player.y, sk.x, sk.y) < SKIRMISH_RADIUS * SKIRMISH_RADIUS) {
      game.hud?.setPrompt?.('E — join the turf fight');
    }

    // Drive-bys.
    if (!state.driveBy) {
      state.nextDriveBy -= dt;
      if (state.nextDriveBy <= 0) {
        state.nextDriveBy = rr(...DRIVEBY_INTERVAL);
        if (inDocks(player.x, player.y) && rand() < 0.7) startDriveBy();
      }
    } else {
      updateDriveBy(dt);
    }

    // Hideout prompt.
    const h = nearestHideout(player.x, player.y);
    if (h && !state.skirmish) {
      game.hud?.setPrompt?.(`E — enter ${h.name} (${GANGS[h.gang].name})`);
      game.gangHideout = h;
    } else {
      game.gangHideout = null;
    }
  }

  /** E interaction from the game loop, when nothing else claims it. */
  function tryInteract(player) {
    if (tryJoinSkirmish()) return true;
    const h = nearestHideout(player.x, player.y);
    if (h) { enterHideout(h); return true; }
    return false;
  }

  function hudInfo() {
    const g = gangAt(game.player.x, game.player.y);
    return {
      gangHere: g ? GANGS[g].name : null,
      gangColor: g ? GANGS[g].color : null,
      heat: g ? heatCell(game.player.x, game.player.y)[g] : 0,
      loyalty: { ...state.loyalty },
      skirmishActive: !!state.skirmish,
      driveByActive: !!state.driveBy,
    };
  }

  function serialize() {
    return {
      loyalty: { ...state.loyalty },
      skirmishesWon: { ...state.skirmishesWon },
      totalSkirmishes: state.totalSkirmishes,
      activeGang: state.activeGang,
      weaponGiven: state.weaponGiven,
    };
  }

  function deserialize(data) {
    if (!data) return;
    if (data.loyalty) state.loyalty = { ...state.loyalty, ...data.loyalty };
    if (data.skirmishesWon) state.skirmishesWon = { ...state.skirmishesWon, ...data.skirmishesWon };
    if (typeof data.totalSkirmishes === 'number') state.totalSkirmishes = data.totalSkirmishes;
    if (data.activeGang) state.activeGang = data.activeGang;
    state.weaponGiven = !!data.weaponGiven;
  }

  return {
    GANGS,
    state,
    update,
    tryInteract,
    tryJoinSkirmish,
    addHeat,
    gangAt,
    spawnMember,
    hudInfo,
    serialize,
    deserialize,
    get loyalty() { return state.loyalty; },
    get skirmish() { return state.skirmish; },
  };
}
