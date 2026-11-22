// Boats: four drivable hulls, water physics with a keel, wake trails, mooring pads at
// the beach marina and the docks slip, a boat shop, and a coast-guard patrol that
// hunts high heat out on the water. Boats never touch the city collision grid — the
// water is their own world, bounded by the shoreline, the bay and the far shore.
//
// Rico boards a boat like a car: it slots into player.car, so the HUD speedo, camera
// look-ahead and exit flow all work unchanged. The hull keeps the spec fields the
// car systems expect (len, wid, top, accel) plus boat-only numbers.

import { PITCH, GRID, SAND } from '../config.js';
import { clamp, TAU, turnDelta, dist2, lerp } from '../util.js';
import { rand, randInt } from '../rng.js';
import { DOCKS_WATER_Y, DOCKS_NORTH_Y } from '../world/district.js';

const SPAN = GRID * PITCH;

export const BOATS = [
  { id: 'sunchaser', name: 'Sunchaser Skiff', len: 76, wid: 30, top: 216, accel: 160, turn: 1.9, hp: 70, price: 450, tone: '#e8dcc0', trim: '#3f6a62', wake: 0.8 },
  { id: 'wavecutter', name: 'Wavecutter', len: 88, wid: 34, top: 336, accel: 260, turn: 2.4, hp: 80, price: 1900, tone: '#f2f4f8', trim: '#19c6d8', wake: 1.15 },
  { id: 'barracuda', name: 'Barracuda', len: 112, wid: 44, top: 282, accel: 205, turn: 1.7, hp: 170, price: 3200, tone: '#3c4654', trim: '#f0a23c', wake: 1.0 },
  { id: 'martini', name: 'Martini Royale', len: 132, wid: 48, top: 252, accel: 175, turn: 1.4, hp: 145, price: 5600, tone: '#f6efe2', trim: '#c9a54e', wake: 0.7 },
];

// Launch points: the beach marina on the ocean, the docks slip on the bay.
const MARINA_PAD = { x: SPAN + SAND + 70, y: 12 * PITCH, ang: Math.PI / 2 };
const DOCKS_PAD = { x: 20 * PITCH + 300, y: DOCKS_WATER_Y - 110, ang: Math.PI };
const SHOP = { x: SPAN + 300, y: 12 * PITCH };

/** Is this world point water a hull may occupy? Two basins: ocean strip and the bay. */
export function waterAt(x, y) {
  if (y > -80 && y < GRID * PITCH + 80 && x > SPAN + SAND - 24) return 'ocean';
  if (y < DOCKS_WATER_Y - 30 && y > DOCKS_NORTH_Y + 90 && x > -60 && x < SPAN + 80) return 'bay';
  return null;
}

export class Boat {
  constructor(def, x, y, ang) {
    this.def = def;
    this.spec = def;            // car-system compatible fields
    this.id = def.id;
    this.name = def.name;
    this.x = x; this.y = y;
    this.ang = ang;
    this.vx = 0; this.vy = 0;
    this.fwd = 0;
    this.gas = 0; this.brake = 0; this.steer = 0; this.slide = false;
    this.hp = def.hp;
    this.wreck = false; this.burn = 0; this.wasted = false;
    this.role = 'owned';        // owned | guard | shop
    this.trail = [];
    this.trailT = 0;
    this.moored = false;
    this.bob = rand() * TAU;
    this.radius = def.len * 0.4;
  }

  get radius2() { return this.radius; }

  /** One hull frame: throttle along the bow, a keel that eats sideways drift. */
  drive(dt, game) {
    if (this.wreck || this.wasted) return;
    const s = this.spec;
    const cos = Math.cos(this.ang), sin = Math.sin(this.ang);
    let fwd = this.vx * cos + this.vy * sin;
    let lat = -this.vx * sin + this.vy * cos;

    // Throttle and reverse. Reverse on a hull is a shy, churning thing.
    const limiter = this.hp < s.hp * 0.4 ? 0.72 : 1;
    const top = s.top * limiter;
    if (this.gas > 0) fwd += s.accel * this.gas * dt;
    if (this.brake > 0) {
      if (fwd > 14) fwd -= s.accel * 1.4 * dt * this.brake;
      else fwd -= s.accel * 0.4 * dt * this.brake;      // astern
    }
    fwd = clamp(fwd, -top * 0.3, top);
    // Water drag: the sea is thicker than air, but kinder than tarmac.
    if (this.gas === 0 && this.brake === 0) fwd -= Math.sign(fwd) * Math.min(Math.abs(fwd), (0.5 * Math.abs(fwd) + 16) * dt);

    // Keel: sideways slip decays hard; the handbrake (Space) swings the stern out.
    const keel = this.slide ? 0.5 : 4.4;
    lat *= Math.pow(1 / (1 + keel * 0.6), dt * 60 * 6);
    lat = clamp(lat, -220, 220);

    // Rudder bites with way on; a drifting hull still answers a little.
    const bite = clamp(Math.abs(fwd) / 90, 0.16, 1) * (1 - clamp((Math.abs(fwd) - s.top * 0.72) / s.top, 0, 0.3));
    this.ang += this.steer * s.turn * bite * dt * (fwd < -5 ? -1 : 1);

    this.vx = cos * fwd - sin * lat;
    this.vy = sin * fwd + cos * lat;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.fwd = fwd;

    this.moored = Math.hypot(this.vx, this.vy) < 22;

    // Shorelines and the island: soft spring walls, no crunching.
    const where = waterAt(this.x, this.y);
    if (!where) {
      // Push back toward the nearest water and scrub speed.
      const back = nearestWater(this.x, this.y);
      this.x = lerp(this.x, back.x, Math.min(1, dt * 8));
      this.y = lerp(this.y, back.y, Math.min(1, dt * 8));
      this.vx *= 0.6; this.vy *= 0.6;
      if (game.fx) game.fx.splash?.(this.x, this.y, 2);
      if (Math.hypot(this.vx, this.vy) > 160 && game.audio) game.audio.crash(0.3);
    }
    const island = game.docks?.island;
    if (island && where === 'bay') {
      const dx = this.x - island.x, dy = this.y - island.y;
      const d = Math.hypot(dx, dy) || 1;
      const rr = (island.rx + island.ry) / 2 + this.radius * 0.6;
      if (d < rr) {
        this.x = island.x + (dx / d) * rr;
        this.y = island.y + (dy / d) * rr;
        this.vx *= 0.55; this.vy *= 0.55;
      }
    }

    // Wake: two diverging lines of churn behind the stern.
    this.trailT -= dt;
    const speed = Math.hypot(this.vx, this.vy);
    if (speed > 42 && this.trailT <= 0) {
      this.trailT = 0.07;
      const bx = this.x - cos * s.len * 0.5;
      const by = this.y - sin * s.len * 0.5;
      this.trail.push({ x: bx, y: by, ang: this.ang, t: 0 });
      if (this.trail.length > 40) this.trail.shift();
    }
  }

  update(dt, game) {
    if (this.wreck && !this.wasted) {
      this.burn -= dt;
      game.fx.smoke(this.x, this.y, 2, true);
      if (this.burn <= 0) {
        this.wasted = true;
        game.fx.blast(this.x, this.y);
        game.audio.boom(0.5);
        if (game.player.car === this) { game.player.car = null; }
      }
      return;
    }
    if (this.wasted) { game.fx.smoke(this.x, this.y, 1, true); return; }
    for (const w of this.trail) w.t += dt;
    while (this.trail.length && this.trail[0].t > 2.4) this.trail.shift();
    this.bob += dt;
  }

  damage(amount, game) {
    if (this.wreck) return;
    this.hp -= amount;
    if (this.hp < this.spec.hp * 0.25) game.fx.carFire(this);
    else if (this.hp < this.spec.hp * 0.5) game.fx.carSmoke(this);
    if (this.hp <= 0) {
      this.wreck = true;
      this.burn = 2.0;
      this.fwd = 0; this.gas = 0; this.brake = 0; this.steer = 0; this.slide = false;
      if (game.player.car === this) game.onPlayerCarBurning(this);
    }
  }
}

/** Nearest legal water point, for hulls that nosed into the sand. */
function nearestWater(x, y) {
  const oceanEdge = SPAN + SAND - 24;
  const bayEdge = DOCKS_WATER_Y - 30;
  // Closer to the ocean wall or the bay wall?
  const dOcean = Math.abs(x - oceanEdge);
  const dBay = Math.abs(y - bayEdge);
  if (y > -80 && dOcean <= dBay) return { x: Math.max(x, oceanEdge), y };
  return { x, y: Math.min(y, bayEdge) };
}

export function createBoats(game) {
  const B = {
    game,
    boats: [],
    shop: SHOP,
    pads: [MARINA_PAD, DOCKS_PAD],
    guard: null,
    guardT: 0,
    owned: [],
    fireT: 0,
  };

  // ---------------------------------------------------------------- persistence

  B.serialize = () => ({ owned: B.owned });
  B.restore = (d) => {
    if (!d || !Array.isArray(d.owned)) return;
    B.owned = d.owned.slice(0, 3);
    for (const id of B.owned) spawnOwned(id);
  };

  function spawnOwned(id) {
    const def = BOATS.find((b) => b.id === id);
    if (!def) return;
    // Berth each hull in its own slot along the marina pad.
    const pad = B.pads[B.boats.length % B.pads.length];
    const b = new Boat(def, pad.x + (B.boats.length % 4) * 44, pad.y, pad.ang);
    b.role = 'owned';
    B.boats.push(b);
  }

  // ---------------------------------------------------------------- shop + boarding

  B.updateShop = function (dt, p) {
    if (B.boats.some((b) => b.role === 'shop')) return;
    // The shop keeps one display hull floating at the marina pad, just off the
    // sand where a buyer can walk to it.
    const demo = new Boat(BOATS[1], MARINA_PAD.x, MARINA_PAD.y - 60, MARINA_PAD.ang);
    demo.role = 'shop';
    B.boats.push(demo);
  };

  B.tryInteract = function (p) {
    // Boarding: the nearest hull within reach.
    let best = null, bd = 110 * 110;
    for (const b of B.boats) {
      if (b.wreck || b.wasted || b.role === 'guard' || b.role === 'shop') continue;
      const d = dist2(b.x, b.y, p.x, p.y);
      if (d < bd) { bd = d; best = b; }
    }
    if (best) {
      p.car = best;
      best.role = 'player';
      best.moored = false;
      game.audio.ensure();
      game.audio.blip(240);
      game.toast(`${best.name} — throttle up.`, '#33e7ff');
      return true;
    }
    // Shop: buy the display hull if the pocket allows; the purchase berths at
    // the pad, a short walk down the sand.
    if (dist2(SHOP.x, SHOP.y, p.x, p.y) < 120 * 120) {
      const demo = B.boats.find((b) => b.role === 'shop');
      if (!demo) return false;
      if (game.player.money < demo.spec.price) {
        game.toast(`The Wavecutter costs $${demo.spec.price}. Come back wetter and richer.`, '#ff7a3c');
        return true;
      }
      game.player.money -= demo.spec.price;
      demo.role = 'owned';
      demo.x = MARINA_PAD.x + (B.owned.length % 4) * 44;
      demo.y = MARINA_PAD.y;
      demo.moored = true;
      B.owned.push(demo.id);
      game.toast(`${demo.name} is yours. She's berthed at the pad — walk down and board.`, '#7bffd4');
      game.save();
      return true;
    }
    return false;
  };

  // ---------------------------------------------------------------- update

  B.update = function (dt, p) {
    B.updateShop(dt, p);

    for (const b of B.boats) {
      if (b === p.car) {
        // The player's hull is driven by Hero.drive; keep its wake turning over.
        b.update(dt, game);
        continue;
      }
      if (b.role === 'guard') guardDrive(b, dt);
      else if (b.role === 'shop') {
        // Display hull idles at its berth.
        b.vx *= 0.9; b.vy *= 0.9;
      }
      b.update(dt, game);
    }

    // Coast guard answers heat on the water.
    const onWater = p.car && p.car instanceof Boat;
    if (onWater && game.wanted.stars >= 3 && !B.guard) spawnGuard();
    if (B.guard) {
      if (!onWater || game.wanted.stars === 0 || B.guard.wreck) {
        // Stand down: the guard peels off toward open water and despawns.
        B.guard.retire = (B.guard.retire ?? 0) + dt;
        if (B.guard.retire > 3) {
          const at = B.boats.indexOf(B.guard);
          if (at >= 0) B.boats.splice(at, 1);
          B.guard = null;
        }
      } else {
        B.guard.retire = 0;
        guardFire(dt, p.car);
      }
    }
  };

  function spawnGuard() {
    const p = game.player;
    // Comes in from deeper water, outside the camera.
    const ang = rand() * TAU;
    const def = BOATS[2];   // Barracuda hull, repaints as the guard
    const g = new Boat(def, p.x + Math.cos(ang) * 1500, clamp(p.y + Math.sin(ang) * 1500, DOCKS_NORTH_Y + 200, GRID * PITCH), ang + Math.PI);
    g.role = 'guard';
    g.hp = def.hp * 1.2;
    g.spec = { ...def, tone: '#22304a', trim: '#4a7dff' };
    B.boats.push(g);
    B.guard = g;
    game.toast('COAST GUARD on the water — they shoot back.', '#4a7dff');
  }

  function guardDrive(g, dt) {
    const p = game.player;
    if (!p.car) { g.gas = 0.4; return; }
    const toP = Math.atan2(p.car.y - g.y, p.car.x - g.x);
    const d = Math.hypot(p.car.x - g.x, p.car.y - g.y);
    // Hold a circling distance and keep the bow on the target.
    const want = d > 460 ? toP : toP + (d < 300 ? 1.15 : 0.5);
    g.steer = clamp(turnDelta(g.ang, want) / 0.6, -1, 1);
    g.gas = d > 340 ? 1 : 0.45;
    g.brake = 0;
    g.drive(dt, game);
  }

  function guardFire(dt, target) {
    B.fireT -= dt;
    if (B.fireT > 0) return;
    B.fireT = 1.5 + rand() * 0.8;
    const g = B.guard;
    const toP = Math.atan2(target.y - g.y, target.x - g.x);
    const spread = (rand() - 0.5) * 0.22;
    game.bullets.fire(g.x + Math.cos(toP) * 40, g.y + Math.sin(toP) * 40, toP + spread, 820, false, 9);
    game.audio.shot?.(0.7);
    game.fx.muzzle(g.x + Math.cos(toP) * 40, g.y + Math.sin(toP) * 40, toP + spread);
  }

  // ---------------------------------------------------------------- render

  /** Hull + wake, drawn in the painter's y-sorted actor pass. */
  B.drawBoat = function (ctx, b) {
    // Wake first so the hull rides on top of its own churn.
    for (const w of b.trail) {
      const a = clamp(1 - w.t / 2.4, 0, 1);
      const spread = 14 + w.t * 46 * b.spec.wake;
      const ca = Math.cos(w.ang + Math.PI / 2), sa = Math.sin(w.ang + Math.PI / 2);
      ctx.strokeStyle = `rgba(190,226,250,${0.30 * a})`;
      ctx.lineWidth = 3.2;
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(w.x + ca * 8 * side, w.y + sa * 8 * side);
        ctx.lineTo(w.x + ca * spread * side, w.y + sa * spread * side);
        ctx.stroke();
      }
    }
    const s = b.spec;
    const cos = Math.cos(b.ang), sin = Math.sin(b.ang);
    const px = (dx, dy) => b.x + dx * cos - dy * sin;
    const py = (dx, dy) => b.y + dx * sin + dy * cos;
    // Shadow in the water.
    ctx.fillStyle = 'rgba(4,10,16,0.4)';
    ctx.beginPath();
    ctx.ellipse(px(-s.len * 0.1, 8), py(-s.len * 0.1, 8), s.len * 0.52, s.wid * 0.6, b.ang, 0, TAU);
    ctx.fill();
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.rotate(b.ang);
    const L = s.len, Wd = s.wid;
    // Hull: pointed bow, squared stern, rub rail.
    ctx.fillStyle = s.tone;
    ctx.beginPath();
    ctx.moveTo(L * 0.5, 0);
    ctx.quadraticCurveTo(L * 0.28, -Wd * 0.52, -L * 0.5, -Wd * 0.5);
    ctx.lineTo(-L * 0.5, Wd * 0.5);
    ctx.quadraticCurveTo(L * 0.28, Wd * 0.52, L * 0.5, 0);
    ctx.closePath();
    ctx.fill();
    // Deck inset.
    ctx.fillStyle = 'rgba(10,14,20,0.22)';
    ctx.beginPath();
    ctx.moveTo(L * 0.34, 0);
    ctx.quadraticCurveTo(L * 0.18, -Wd * 0.3, -L * 0.42, -Wd * 0.3);
    ctx.lineTo(-L * 0.42, Wd * 0.3);
    ctx.quadraticCurveTo(L * 0.18, Wd * 0.3, L * 0.34, 0);
    ctx.closePath();
    ctx.fill();
    // Trim stripe + transom.
    ctx.fillStyle = s.trim;
    ctx.fillRect(-L * 0.5 - 2, -Wd * 0.5, 5, Wd);
    ctx.fillRect(-L * 0.46, -Wd * 0.16, L * 0.7, 4);
    // Cabin / console by model.
    if (b.id === 'martini') {
      ctx.fillStyle = '#d9cfb4';
      ctx.fillRect(-L * 0.16, -Wd * 0.26, L * 0.3, Wd * 0.52);
      ctx.fillStyle = '#20242c';
      ctx.fillRect(-L * 0.06, -Wd * 0.18, L * 0.16, Wd * 0.36);
    } else if (b.id === 'barracuda') {
      ctx.fillStyle = '#2c3440';
      ctx.fillRect(-L * 0.3, -Wd * 0.3, L * 0.26, Wd * 0.6);
      ctx.fillStyle = s.trim;
      ctx.fillRect(-L * 0.3, -Wd * 0.3, L * 0.26, 5);
    } else if (b.id === 'wavecutter') {
      ctx.fillStyle = '#1d222c';
      ctx.fillRect(L * 0.02, -Wd * 0.2, L * 0.16, Wd * 0.4);
    } else {
      ctx.fillStyle = '#6f6350';
      ctx.fillRect(-L * 0.1, -Wd * 0.22, L * 0.2, Wd * 0.44);
    }
    // Bow light tip.
    ctx.fillStyle = '#ffe9b0';
    ctx.beginPath(); ctx.arc(L * 0.46, 0, 2.6, 0, TAU); ctx.fill();
    // Guard livery: white band + beacon.
    if (b.role === 'guard') {
      ctx.fillStyle = '#e9ecf4';
      ctx.fillRect(-L * 0.48, -Wd * 0.44, L * 0.12, Wd * 0.88);
      const on = Math.floor(game.time * 5) % 2;
      ctx.fillStyle = on ? '#ff4a55' : '#4a7dff';
      ctx.beginPath(); ctx.arc(-L * 0.18, 0, 4, 0, TAU); ctx.fill();
    }
    // Player marker: a subtle keel line.
    if (b.role === 'player') {
      ctx.strokeStyle = 'rgba(123,255,212,0.5)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(L * 0.4, 0); ctx.lineTo(-L * 0.42, 0);
      ctx.stroke();
    }
    ctx.restore();
  };

  /** Additive nav lights + wake sparkle for the glow pass. */
  B.drawGlow = function (ctx, b) {
    if (b.wasted) return;
    const s = b.spec;
    const cos = Math.cos(b.ang), sin = Math.sin(b.ang);
    // Port red, starboard green, stern white.
    const red = { x: b.x - sin * -s.wid * 0.55 - cos * 4, y: b.y + cos * -s.wid * 0.55 - sin * 4 };
    const grn = { x: b.x - sin * s.wid * 0.55 - cos * 4, y: b.y + cos * s.wid * 0.55 - sin * 4 };
    const stern = { x: b.x - cos * s.len * 0.52, y: b.y - sin * s.len * 0.52 };
    nav(ctx, red.x, red.y, 'rgba(255,90,90,0.5)');
    nav(ctx, grn.x, grn.y, 'rgba(110,255,150,0.5)');
    nav(ctx, stern.x, stern.y, 'rgba(255,255,240,0.4)');
    // Wake shimmer.
    for (const w of b.trail) {
      const a = clamp(1 - w.t / 2.4, 0, 1) * 0.2;
      ctx.fillStyle = `rgba(190,226,250,${a})`;
      ctx.beginPath(); ctx.arc(w.x, w.y, 6 + w.t * 10, 0, TAU); ctx.fill();
    }
  };

  function nav(ctx, x, y, color) {
    const g = ctx.createRadialGradient(x, y, 1, x, y, 16);
    g.addColorStop(0, color);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, 16, 0, TAU); ctx.fill();
  }

  /** Prompt bookkeeping: board / buy / moor hints. */
  B.prompt = function (p) {
    if (p.car) return;
    let near = null;
    for (const b of B.boats) {
      if (b.wreck || b.wasted || b.role === 'guard') continue;
      if (dist2(b.x, b.y, p.x, p.y) < 110 * 110) { near = b; break; }
    }
    if (near) { game.hud?.setPrompt(`E — BOARD ${near.name.toUpperCase()}`); return; }
    if (dist2(SHOP.x, SHOP.y, p.x, p.y) < 120 * 120) {
      game.hud?.setPrompt('E — WAVECUTTER, $1900 (boat shop)');
    }
  };

  return B;
}
