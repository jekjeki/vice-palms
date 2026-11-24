// cars.js — 8 vehicle types, arcade drift physics, damage (smoke/fire/explode),
// headlights, car-vs-world and car-vs-car collisions.

import { CFG } from './config.js';
import { clamp, resolveCircleSolids } from './util.js';
import { isWaterPoint } from './world.js';

// ------------------------------------------------------------------ types

export const VEH = {
  sedan: { id: 'sedan', name: 'Cheetah Prairie', accel: 200, max: 265, rev: 120, turn: 2.7, mass: 1.0, w: 30, l: 52, hp: 100, brake: 430, drag: 0.55 },
  sports: { id: 'sports', name: 'Banshee GT', accel: 320, max: 395, rev: 140, turn: 3.1, mass: 0.9, w: 28, l: 50, hp: 85, brake: 520, drag: 0.42 },
  taxi: { id: 'taxi', name: 'Palm Cab', accel: 210, max: 272, rev: 120, turn: 2.8, mass: 1.0, w: 30, l: 52, hp: 105, brake: 430, drag: 0.55 },
  van: { id: 'van', name: 'Rumpo Van', accel: 155, max: 225, rev: 110, turn: 2.2, mass: 1.5, w: 34, l: 62, hp: 145, brake: 380, drag: 0.7 },
  truck: { id: 'truck', name: 'Barracks Hauler', accel: 125, max: 198, rev: 95, turn: 1.7, mass: 2.3, w: 40, l: 86, hp: 230, brake: 330, drag: 0.85 },
  limo: { id: 'limo', name: 'Stretch Palms', accel: 165, max: 258, rev: 110, turn: 1.9, mass: 1.6, w: 30, l: 80, hp: 165, brake: 400, drag: 0.7 },
  buggy: { id: 'buggy', name: 'Sand buggy', accel: 250, max: 305, rev: 130, turn: 3.5, mass: 0.8, w: 30, l: 46, hp: 70, brake: 470, drag: 0.5 },
  police: { id: 'police', name: 'VP Cruiser', accel: 280, max: 345, rev: 130, turn: 3.0, mass: 1.15, w: 30, l: 52, hp: 125, brake: 480, drag: 0.5 },
};

let nextCarId = 1;

export function makeCar(g, x, y, ang, typeId, opts = {}) {
  const type = VEH[typeId] || VEH.sedan;
  const c = {
    id: nextCarId++,
    type,
    x, y, ang,
    vx: 0, vy: 0,
    steerVis: 0,
    throttle: 0, brake: 0, steer: 0, handbrake: false, horn: false,
    w: type.w, l: type.l,
    color: opts.color || '#b8bcc8',
    kind: opts.kind || 'traffic',   // traffic | police | parked | mission
    hp: type.hp,
    maxHp: type.hp,
    dead: false,
    exploded: false,
    burning: 0,           // counts down once on fire
    smokeT: 0,
    lightbar: opts.siren || false,
    siren: false,
    driver: opts.driver || null,   // 'player' | 'npc' | null
    // traffic AI
    dir: opts.dir != null ? opts.dir : Math.round(((ang % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2) / (Math.PI / 2)) & 3,
    target: null,
    waitT: 0,
    stuckT: 0,
    panicT: 0,
    // police AI
    copMode: opts.copMode || null, // 'pursuit' | 'block' | 'parked'
    shootCd: 1,
    spawnT: opts.spawnT || 0,
    ttl: opts.ttl || 0,            // >0: remove when expired
    decal: 0,
    parked: opts.kind === 'parked',
    honkT: 0,
  };
  g.cars.push(c);
  return c;
}

// ------------------------------------------------------------------ physics

/** per-frame control + integration for one car */
export function updateCarPhysics(g, c, dt) {
  if (c.dead) {
    // burnt hull: settle
    c.vx *= 0.85;
    c.vy *= 0.85;
    c.x += c.vx * dt;
    c.y += c.vy * dt;
    return;
  }
  const T = c.type;
  const cos = Math.cos(c.ang), sin = Math.sin(c.ang);
  let vf = c.vx * cos + c.vy * sin;          // forward speed
  let vl = -c.vx * sin + c.vy * cos;         // lateral speed
  const gripT = c.handbrake ? 0.985 : 0.9;
  const latKeep = Math.pow(gripT, dt * 60);
  vl *= latKeep;

  if (c.parked && c.kind !== 'mission') {
    // parked cars only move when pushed
    c.vx *= 0.9;
    c.vy *= 0.9;
  } else {
    // throttle / brake / reverse
    if (c.throttle > 0) {
      const head = 1 - clamp(Math.abs(vf) / T.max, 0, 1);
      vf += T.accel * c.throttle * (0.35 + 0.65 * head) * dt * (vf < 0 ? 2 : 1);
    }
    if (c.brake > 0) {
      if (vf > 8) vf -= T.brake * c.brake * dt;
      else vf -= T.accel * 0.6 * c.brake * dt; // reverse
      if (vf < -T.rev) vf = -T.rev;
    }
    // drag + rolling resistance
    vf -= vf * T.drag * dt * 0.1;
    if (c.throttle === 0 && c.brake === 0) vf *= Math.pow(0.985, dt * 60);
    if (Math.abs(vf) < 3 && c.throttle === 0) vf = 0;

    // steering
    const steerAmt = clamp(Math.abs(vf) / 110, 0, 1);
    const dirSign = vf < 0 ? -1 : 1;
    c.ang += c.steer * T.turn * steerAmt * dirSign * dt;
    c.steerVis += (c.steer * 0.5 - c.steerVis) * clamp(dt * 10, 0, 1);

    // handbrake scrub
    if (c.handbrake) vf *= Math.pow(0.96, dt * 60);
  }

  // recompose
  c.vx = cos * vf - sin * vl;
  c.vy = sin * vf + cos * vl;
  c.x += c.vx * dt;
  c.y += c.vy * dt;

  collideCarWorld(g, c, dt);
}

/** two soft circles front/rear vs solids and water */
export function collideCarWorld(g, c, dt) {
  const r = c.w * 0.44;
  const cos = Math.cos(c.ang), sin = Math.sin(c.ang);
  const off = c.l * 0.27;
  let impact = 0;
  for (const s of [1, -1]) {
    const px = c.x + cos * off * s;
    const py = c.y + sin * off * s;
    const res = resolveCircleSolids(px, py, r, g.world.solids);
    if (res.hit) {
      c.x += res.x - px;
      c.y += res.y - py;
      const vn = c.vx * res.nx + c.vy * res.ny; // velocity into the wall
      if (vn < -40) {
        impact = Math.max(impact, -vn);
        c.vx -= res.nx * vn * 1.35;
        c.vy -= res.ny * vn * 1.35;
      } else {
        c.vx *= 0.92;
        c.vy *= 0.92;
      }
    }
    if (isWaterPoint(px, py)) {
      c.x -= (res.x - px) * 0;
      c.x += (c.x + cos * off * s - px) * 0; // no-op guard
      // push back along heading
      c.x -= cos * 3;
      c.y -= sin * 3;
      c.vx *= 0.5;
      c.vy *= 0.5;
    }
  }
  // world bounds
  const m = 30;
  if (c.x < m) { c.x = m; c.vx = Math.abs(c.vx) * 0.4; }
  if (c.y < m) { c.y = m; c.vy = Math.abs(c.vy) * 0.4; }
  if (c.x > CFG.WORLD_W - m) { c.x = CFG.WORLD_W - m; c.vx = -Math.abs(c.vx) * 0.4; }
  if (c.y > CFG.WORLD_H - m) { c.y = CFG.WORLD_H - m; c.vy = -Math.abs(c.vy) * 0.4; }

  if (impact > 60) {
    damageCar(g, c, impact * 0.16, 'wall');
    g.audio && g.audio.crash(clamp(impact / 400, 0.2, 1));
    if (c.driver === 'player') shakeCam(g, clamp(impact / 300, 0, 6));
  }
}

/** pairwise separation + crash damage for the whole fleet */
export function collideFleet(g) {
  const cars = g.cars;
  for (let i = 0; i < cars.length; i++) {
    const a = cars[i];
    for (let j = i + 1; j < cars.length; j++) {
      const b = cars[j];
      const dx = b.x - a.x, dy = b.y - a.y;
      const d2 = dx * dx + dy * dy;
      const rr = (a.l + b.l) * 0.34;
      if (d2 > rr * rr || d2 < 1e-6) continue;
      const d = Math.sqrt(d2);
      const nx = dx / d, ny = dy / d;
      const push = (rr - d) / 2;
      const ma = a.type.mass, mb = b.type.mass;
      const tot = ma + mb;
      a.x -= nx * push * (mb / tot) * 2;
      a.y -= ny * push * (mb / tot) * 2;
      b.x += nx * push * (ma / tot) * 2;
      b.y += ny * push * (ma / tot) * 2;
      // relative normal speed
      const rvx = b.vx - a.vx, rvy = b.vy - a.vy;
      const rel = rvx * nx + rvy * ny;
      if (rel < -30) {
        const imp = -rel;
        a.vx -= nx * imp * 0.6 * (mb / tot);
        a.vy -= ny * imp * 0.6 * (mb / tot);
        b.vx += nx * imp * 0.6 * (ma / tot);
        b.vy += ny * imp * 0.6 * (ma / tot);
        const dmg = imp * 0.09;
        if (imp > 90) {
          damageCar(g, a, dmg * (mb / tot), 'crash');
          damageCar(g, b, dmg * (ma / tot), 'crash');
          g.audio && g.audio.crash(clamp(imp / 380, 0.2, 1));
          sparkBurst(g, (a.x + b.x) / 2, (a.y + b.y) / 2, 6);
          if (a.driver === 'player' || b.driver === 'player') {
            shakeCam(g, clamp(imp / 320, 0, 7));
            if (imp > 240) bumpPedalsHurt(g, 4);
          }
        }
      }
    }
  }
}

// ------------------------------------------------------------------ damage

export function damageCar(g, c, amount, src) {
  if (c.dead) return;
  c.hp -= amount;
  if (c.hp <= CFG.FIRE_HP && c.burning === 0 && !c.exploded) {
    c.burning = CFG.CAR_BURN_TIME;
  }
  if (c.hp <= 0 && !c.exploded) {
    explodeCar(g, c);
  }
}

export function explodeCar(g, c) {
  if (c.exploded) return;
  c.exploded = true;
  c.dead = true;
  c.burning = 0;
  c.hp = 0;
  c.color = '#26262a';
  g.explosions.push({ x: c.x, y: c.y, t: 0, power: 1 });
  g.audio && g.audio.explosion();
  shakeCam(g, 14);
  // area damage
  for (const o of g.cars) {
    if (o === c || o.dead) continue;
    const d = Math.hypot(o.x - c.x, o.y - c.y);
    if (d < CFG.EXPLOSION_R) damageCar(g, o, CFG.EXPLOSION_DMG * (1 - d / CFG.EXPLOSION_R), 'blast');
  }
  for (const p of g.peds) {
    if (p.dead) continue;
    const d = Math.hypot(p.x - c.x, p.y - c.y);
    if (d < CFG.EXPLOSION_R) g.hooks.hurtPed(p, 120, 'blast');
  }
  if (g.player && !g.player.dead) {
    const d = Math.hypot(g.player.x - c.x, g.player.y - c.y);
    if (d < CFG.EXPLOSION_R) {
      g.hooks.hurtPlayer(CFG.EXPLOSION_DMG * (1 - d / CFG.EXPLOSION_R) * 1.1, 'blast');
    }
  }
  if (c.driver === 'player') {
    g.player.car = null;
    c.driver = null;
  }
  sparkBurst(g, c.x, c.y, 26);
  g.panicT = Math.max(g.panicT, 4);
}

/** car fire & smoke particle emission; returns true if car should be culled */
export function updateCarDamage(g, c, dt) {
  if (c.dead) {
    c.decal += dt;
    if (c.decal > 3 && c.decal < 8 && Math.random() < dt * 8) {
      g.parts.push(mkPart(c.x + rnd(-8, 8), c.y + rnd(-8, 8), rnd(-6, 6), rnd(-14, -4), 1.6, 'smoke'));
    }
    return c.ttl > 0 && c.decal > c.ttl;
  }
  if (c.hp < CFG.SMOKE_HP && Math.random() < dt * (c.hp < CFG.FIRE_HP ? 4 : 14)) {
    const cos = Math.cos(c.ang), sin = Math.sin(c.ang);
    g.parts.push(mkPart(c.x - cos * c.l * 0.3 + rnd(-6, 6), c.y - sin * c.l * 0.3 + rnd(-6, 6), rnd(-8, 8), rnd(-16, -6), 1.4, c.hp < CFG.FIRE_HP ? 'fire' : 'smoke'));
  }
  if (c.burning > 0) {
    c.burning -= dt;
    if (Math.random() < dt * 20) {
      g.parts.push(mkPart(c.x + rnd(-10, 10), c.y + rnd(-10, 10), rnd(-10, 10), rnd(-40, -14), 0.9, 'fire'));
    }
    if (c.burning <= 0) explodeCar(g, c);
  }
  return false;
}

// ------------------------------------------------------------------ helpers

export function mkPart(x, y, vx, vy, life, kind) {
  return { x, y, vx, vy, life, maxLife: life, kind };
}

export function sparkBurst(g, x, y, n) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = 60 + Math.random() * 240;
    g.parts.push(mkPart(x, y, Math.cos(a) * sp, Math.sin(a) * sp, 0.35 + Math.random() * 0.3, 'spark'));
  }
}

export function rnd(a, b) {
  return a + Math.random() * (b - a);
}

export function shakeCam(g, amt) {
  g.cam.shake = Math.min(18, g.cam.shake + amt);
}

function bumpPedalsHurt(g, dmg) {
  // hard crash hurts the driver a little
  g.hooks.hurtPlayer(dmg, 'crash');
}

export function carSpeed(c) {
  return Math.hypot(c.vx, c.vy);
}

/** front-point world position of a car */
export function carFront(c, f = 0.4) {
  return { x: c.x + Math.cos(c.ang) * c.l * f, y: c.y + Math.sin(c.ang) * c.l * f };
}
