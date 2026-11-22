// Enterable interiors: four venues on the street grid — the Riviera club, the Coral Diner,
// Rosa's garage bay and the 24-hour pawn shop. Each has a door marker on the sidewalk; walk up
// on foot, press G, and the scene swaps to a hand-drawn room with its own furniture, patrons,
// pickups and exit door. The world keeps running outside; the interior is a pocket of the map
// set out past the beach, so no street collision logic ever needs to know it exists.
//
// Integration: Game constructs one Interiors after the player exists; game.js calls update()
// inside the fixed step (movement, walls, pickups) and main.js swaps the whole render path to
// render(ctx, W, H) while `inside` is set, then still draws the HUD on top.

import { PITCH, ROAD, WALK } from '../config.js';
import { clamp, dist2, TAU } from '../util.js';
import { chance, randInt } from '../rng.js';
import { plateDraw, prompt, plate } from '../render/overlays.js';

/** The ocean pocket where rooms live, east of the sand. */
const ROOM_X0 = 40 * PITCH + 520 + 1600;   // past sand and ocean paint
const ROOM_Y0 = 900;

/** A door marker placed on a street-adjacent sidewalk. */
function doorAt(i, j, side) {
  const cx = (i + 0.5) * PITCH;
  const cy = (j + 1) * PITCH - ROAD / 2 - WALK / 2;
  if (side === 'north') return { x: cx, y: j * PITCH + ROAD / 2 + WALK / 2 };
  if (side === 'east') return { x: (i + 1) * PITCH - ROAD / 2 - WALK / 2, y: cy };
  if (side === 'west') return { x: i * PITCH + ROAD / 2 + WALK / 2, y: cy };
  return { x: cx, y: cy };
}

/** Room geometry: entry pad at the west wall, the walkable floor inset by walls. */
function room(idx, w, h) {
  return { x: ROOM_X0 + idx * 1400, y: ROOM_Y0 + idx * 1100, w, h };
}

/** The venues. Each: name, door on the grid, room size, furniture spec, patrons, pickups. */
export const VENUES = [
  {
    id: 'club',
    name: 'CLUB RIVIERA',
    tint: '#ff3fa4',
    door: doorAt(38, 10, 'north'),
    room: room(0, 620, 460),
    floor: '#181026',
    floorAlt: '#1f1433',
    pickupKinds: ['cash', 'armor', 'cash'],
    greet: 'The Riviera: bass through the walls, nobody asks questions at the door.',
    furniture: ['dancefloor', 'djbooth', 'bar', 'speakers'],
    patrons: 5,
  },
  {
    id: 'diner',
    name: 'CORAL DINER',
    tint: '#33e7ff',
    door: doorAt(21, 17, 'north'),
    room: room(1, 560, 420),
    floor: '#10222b',
    floorAlt: '#142c38',
    pickupKinds: ['health', 'cash', 'health'],
    greet: 'The diner: burnt coffee, cold pie, the best booth gossip on the strip.',
    furniture: ['counter', 'booths', 'jukebox', 'kitchen'],
    patrons: 3,
  },
  {
    id: 'garage',
    name: 'ROSA’S GARAGE',
    tint: '#ffc042',
    door: doorAt(12, 26, 'north'),
    room: room(2, 660, 440),
    floor: '#1c1a16',
    floorAlt: '#242019',
    pickupKinds: ['pistol', 'armor', 'cash'],
    greet: 'Rosa’s bay: oil, caffeine, and one lift that has never held a legal car.',
    furniture: ['lift', 'toolbox', 'workbench', 'tirestack'],
    patrons: 1,
  },
  {
    id: 'pawn',
    name: '24H PAWN',
    tint: '#a86bff',
    door: doorAt(24, 7, 'north'),
    room: room(3, 520, 400),
    floor: '#141020',
    floorAlt: '#1a1529',
    pickupKinds: ['cash', 'pistol', 'cash'],
    greet: 'The pawn shop: everything for sale, nothing with a story attached.',
    furniture: ['cases', 'shelf', 'pawncounter', 'vaultdoor'],
    patrons: 2,
  },
];

/** Furniture painters, one per spec key. All draw in room-local coords. */
const PAINT_FURNITURE = {
  dancefloor(ctx, r, t) {
    const x = r.x + r.w * 0.5, y = r.y + r.h * 0.46, s = 150;
    const cells = 4;
    for (let i = 0; i < cells; i++) {
      for (let j = 0; j < cells; j++) {
        const lit = (Math.floor(t * 2.2) + i + j) % 3 === 0;
        ctx.fillStyle = lit ? 'rgba(255,63,164,0.34)' : 'rgba(51,231,255,0.16)';
        ctx.fillRect(x - s / 2 + i * (s / cells), y - s / 2 + j * (s / cells), s / cells - 4, s / cells - 4);
      }
    }
  },
  djbooth(ctx, r, t) {
    const x = r.x + r.w * 0.5, y = r.y + 52;
    ctx.fillStyle = '#241a33';
    ctx.fillRect(x - 60, y, 120, 44);
    ctx.fillStyle = '#33e7ff';
    ctx.globalAlpha = 0.5 + 0.3 * Math.sin(t * 5);
    ctx.fillRect(x - 46, y + 8, 20, 12);
    ctx.fillRect(x + 20, y + 8, 26, 12);
    ctx.globalAlpha = 1;
  },
  bar(ctx, r) {
    const x = r.x + 74, y = r.y + r.h - 96;
    ctx.fillStyle = '#2a2033';
    ctx.fillRect(x, y, 210, 40);
    ctx.fillStyle = '#8a5cd6';
    ctx.globalAlpha = 0.35;
    ctx.fillRect(x + 8, y - 8, 194, 8);
    ctx.globalAlpha = 1;
    for (let i = 0; i < 5; i++) ctx.fillRect(x + 14 + i * 40, y + 10, 8, 20);
  },
  speakers(ctx, r) {
    for (const sx of [r.x + r.w * 0.18, r.x + r.w * 0.82]) {
      ctx.fillStyle = '#0e0a18';
      ctx.fillRect(sx - 16, r.y + 30, 32, 54);
      ctx.fillStyle = 'rgba(255,63,164,0.5)';
      ctx.beginPath(); ctx.arc(sx, r.y + 52, 8, 0, TAU); ctx.fill();
    }
  },
  counter(ctx, r) {
    ctx.fillStyle = '#274050';
    ctx.fillRect(r.x + 70, r.y + 60, r.w - 200, 46);
    ctx.fillStyle = '#33e7ff';
    ctx.globalAlpha = 0.28;
    ctx.fillRect(r.x + 70, r.y + 54, r.w - 200, 6);
    ctx.globalAlpha = 1;
  },
  pawncounter(ctx, r) {
    // The pawn shop's L-shaped service counter: glass top, brass edge.
    ctx.fillStyle = '#2b2340';
    ctx.fillRect(r.x + 56, r.y + r.h * 0.5 - 30, r.w - 130, 60);
    ctx.fillStyle = 'rgba(168,107,255,0.4)';
    ctx.fillRect(r.x + 56, r.y + r.h * 0.5 - 36, r.w - 130, 6);
  },
  booths(ctx, r) {
    for (let i = 0; i < 3; i++) {
      const y = r.y + r.h - 130;
      const x = r.x + 60 + i * 130;
      ctx.fillStyle = '#1b4152';
      ctx.fillRect(x, y, 96, 64);
      ctx.fillStyle = '#15313d';
      ctx.fillRect(x + 10, y + 14, 76, 36);
    }
  },
  jukebox(ctx, r, t) {
    const x = r.x + r.w - 90, y = r.y + 56;
    ctx.fillStyle = '#101c26';
    ctx.fillRect(x, y, 56, 84);
    ctx.fillStyle = `rgba(51,231,255,${0.4 + 0.3 * Math.sin(t * 3.4)})`;
    ctx.fillRect(x + 8, y + 10, 40, 30);
  },
  kitchen(ctx, r) {
    ctx.fillStyle = '#22303a';
    ctx.fillRect(r.x + r.w - 150, r.y + r.h - 100, 110, 60);
    ctx.fillStyle = 'rgba(255,192,66,0.35)';
    ctx.fillRect(r.x + r.w - 150, r.y + r.h - 106, 110, 6);
  },
  lift(ctx, r) {
    ctx.fillStyle = '#3a3428';
    ctx.fillRect(r.x + r.w * 0.5 - 90, r.y + r.h * 0.5 - 40, 180, 96);
    ctx.fillStyle = '#59503a';
    ctx.fillRect(r.x + r.w * 0.5 - 70, r.y + r.h * 0.5 - 22, 140, 58);
  },
  toolbox(ctx, r) {
    ctx.fillStyle = '#7a2e2e';
    ctx.fillRect(r.x + 56, r.y + 60, 64, 34);
    ctx.fillStyle = '#b04a4a';
    ctx.fillRect(r.x + 56, r.y + 52, 64, 8);
  },
  workbench(ctx, r) {
    ctx.fillStyle = '#4a4232';
    ctx.fillRect(r.x + r.w - 210, r.y + 56, 170, 44);
    ctx.fillStyle = '#8a8f9e';
    ctx.fillRect(r.x + r.w - 200, r.y + 48, 24, 8);
    ctx.fillRect(r.x + r.w - 160, r.y + 48, 24, 8);
  },
  tirestack(ctx, r) {
    for (let i = 0; i < 3; i++) {
      ctx.fillStyle = '#14161c';
      ctx.beginPath(); ctx.arc(r.x + 84, r.y + r.h - 70 - i * 16, 26 - i * 2, 0, TAU); ctx.fill();
      ctx.fillStyle = '#23262e';
      ctx.beginPath(); ctx.arc(r.x + 84, r.y + r.h - 70 - i * 16, 12, 0, TAU); ctx.fill();
    }
  },
  cases(ctx, r) {
    for (let i = 0; i < 3; i++) {
      ctx.fillStyle = '#241a3a';
      ctx.fillRect(r.x + 66 + i * 120, r.y + 58, 100, 40);
      ctx.fillStyle = `rgba(168,107,255,${0.25 + 0.15 * Math.sin((i + 1) * 1.7)})`;
      ctx.fillRect(r.x + 72 + i * 120, r.y + 64, 88, 28);
    }
  },
  shelf(ctx, r) {
    ctx.fillStyle = '#2b2340';
    ctx.fillRect(r.x + r.w - 170, r.y + r.h - 120, 130, 74);
    ctx.fillStyle = '#3d3358';
    for (let i = 0; i < 6; i++) ctx.fillRect(r.x + r.w - 164 + (i % 3) * 42, r.y + r.h - 112 + Math.floor(i / 3) * 34, 30, 22);
  },
  vaultdoor(ctx, r) {
    ctx.fillStyle = '#1c1626';
    ctx.fillRect(r.x + r.w - 64, r.y + r.h - 64, 44, 44);
    ctx.strokeStyle = '#a86bff';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(r.x + r.w - 42, r.y + r.h - 42, 10, 0, TAU); ctx.stroke();
  },
};

export class Interiors {
  constructor(game) {
    this.game = game;
    this.current = null;        // the venue while inside
    this.outside = null;        // { x, y, heading } to restore on exit
    this.items = new Map();     // venue id -> [{x,y,kind,amount,dead,respawnAt,phase}]
    this.seedItems();
    this.enterCool = 0;         // debounce on the door key
    this.nearDoor = null;       // { venue, d } for the prompt
    this.patrons = new Map();   // venue id -> [{x,y,seed,phase,color}]
    this.seedPatrons();
    this.roomT = 0;             // time spent inside, drives animation
    this.exitedAt = -9;
  }

  /** Whether the render path should show a room instead of the city. */
  get inside() { return this.current !== null; }

  seedItems() {
    for (const v of VENUES) {
      const list = [];
      const spots = [[0.2, 0.3], [0.78, 0.3], [0.5, 0.72]];
      v.pickupKinds.forEach((kind, k) => {
        const [fx, fy] = spots[k % spots.length];
        list.push({
          x: v.room.x + v.room.w * fx,
          y: v.room.y + v.room.h * fy,
          kind, amount: kind === 'pistol' ? 18 : kind === 'cash' ? 90 + randInt(120) : 50,
          dead: false, respawnAt: 0, phase: k * 1.9,
        });
      });
      this.items.set(v.id, list);
    }
  }

  seedPatrons() {
    for (const v of VENUES) {
      const list = [];
      for (let n = 0; n < v.patrons; n++) {
        list.push({
          x: v.room.x + 70 + (n % 3) * (v.room.w - 160) / 2 + (n % 2) * 30,
          y: v.room.y + 110 + Math.floor(n / 3) * 120 + (n % 4) * 18,
          seed: n * 37 + v.name.length,
          phase: n * 1.3,
          color: ['#c46fd9', '#5fa8d9', '#d9c15f', '#3fae9a'][(n + v.id.length) % 4],
        });
      }
      this.patrons.set(v.id, list);
    }
  }

  // ---------------------------------------------------------------- doors + stepping

  /** Door proximity each step (on foot only): sets the enter prompt target. */
  scanDoors(player) {
    if (this.enterCool > 0 || player.car) { this.nearDoor = null; return; }
    let best = null, bestD = 58 * 58;
    for (const v of VENUES) {
      const d = dist2(player.x, player.y, v.door.x, v.door.y);
      if (d < bestD) { best = v; bestD = d; }
    }
    this.nearDoor = best;
  }

  tryEnter() {
    if (this.current) this.tryExit();
    else if (this.nearDoor) this.enter(this.nearDoor);
  }

  enter(v) {
    const p = this.game.player;
    this.outside = { x: p.x, y: p.y, heading: p.heading };
    this.current = v;
    this.roomT = 0;
    p.x = v.room.x + 60;
    p.y = v.room.y + v.room.h / 2;
    p.vx = 0; p.vy = 0;
    p.heading = 0;
    this.enterCool = 0.6;
    this.game.audio.blip(520);
    this.game.dialog?.push('ambient', v.name, v.greet, 3.6, 3);
    const cam = this.game.camera;
    cam.x = p.x; cam.y = p.y; cam.zoom = 1.05;
  }

  tryExit() {
    const v = this.current;
    const p = this.game.player;
    // The exit pad is the west wall entry point.
    if (dist2(p.x, p.y, v.room.x + 60, v.room.y + v.room.h / 2) > 52 * 52) return;
    this.exit();
  }

  exit() {
    const v = this.current;
    const p = this.game.player;
    const o = this.outside ?? VENUES[0].door;
    p.x = o.x; p.y = o.y + 8;
    p.vx = 0; p.vy = 0;
    p.heading = o.heading ?? Math.PI / 2;
    this.current = null;
    this.enterCool = 0.6;
    this.exitedAt = this.game.time;
    this.game.audio.blip(360);
    const cam = this.game.camera;
    cam.x = p.x; cam.y = p.y;
  }

  /** Leave without the door checks: deaths and respawns must never strand Rico in a room. */
  forceExit() {
    if (!this.current) return;
    const p = this.game.player;
    const o = this.outside;
    this.current = null;
    this.enterCool = 0.4;
    if (o) { p.x = o.x; p.y = o.y + 8; }
    this.game.camera.x = p.x;
    this.game.camera.y = p.y;
  }

  // ---------------------------------------------------------------- per step

  update(dt, input) {
    const g = this.game;
    this.enterCool = Math.max(0, this.enterCool - dt);
    if (!this.current) {
      this.scanDoors(g.player);
      if (this.nearDoor && input.tap('KeyG') && this.enterCool <= 0) this.enter(this.nearDoor);
      return;
    }
    this.roomT += dt;
    const v = this.current;
    const p = g.player;
    // Walls: the player walks freely in the fixed step, then gets pushed back inside.
    const wall = 34;
    p.x = clamp(p.x, v.room.x + wall, v.room.x + v.room.w - wall);
    p.y = clamp(p.y, v.room.y + wall, v.room.y + v.room.h - wall);
    // Camera pinned to the room, slightly wider than a street zoom.
    const cam = g.camera;
    cam.x += (p.x - cam.x) * Math.min(1, dt * 5);
    cam.y += (p.y - cam.y) * Math.min(1, dt * 5);
    cam.zoom += (1.05 - cam.zoom) * Math.min(1, dt * 3);
    // Interior pickups: grab on touch, respawn like the street supply.
    const list = this.items.get(v.id);
    for (const it of list) {
      if (it.dead) {
        if (this.roomT >= it.respawnAt) it.dead = false;
        continue;
      }
      if (dist2(it.x, it.y, p.x, p.y) < 30 * 30) {
        p.pickup(it.kind, it.amount);
        it.dead = true;
        it.respawnAt = this.roomT + 45;
      }
    }
    // Exit: stand on the entry pad and press G.
    if (input.tap('KeyG') && this.enterCool <= 0) this.tryExit();
  }

  // ---------------------------------------------------------------- render

  /** The full-screen room render replacing the city view while inside. */
  render(ctx, W, H) {
    const v = this.current;
    const g = this.game;
    const r = v.room;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    // A dark surround so the room reads as an interior, not a floating rectangle.
    ctx.fillStyle = '#05060c';
    ctx.fillRect(0, 0, W, H);
    // Fit the room on screen with a margin, centered.
    const k = Math.min((W - 80) / r.w, (H - 80) / r.h, 1.6);
    const ox = W / 2 - r.w * k / 2;
    const oy = H / 2 - r.h * k / 2;
    ctx.save();
    ctx.translate(ox, oy);
    ctx.scale(k, k);

    // Floor: checker of the venue's two tones.
    const cell = 46;
    for (let x = 0; x < r.w; x += cell) {
      for (let y = 0; y < r.h; y += cell) {
        ctx.fillStyle = ((x / cell + y / cell) % 2 < 1) ? v.floor : v.floorAlt;
        ctx.fillRect(r.x + x, r.y + y, cell, cell);
      }
    }
    // Walls as a thick rim, with a neon wash in the venue tint.
    ctx.fillStyle = '#0a0c14';
    ctx.fillRect(r.x - 18, r.y - 18, r.w + 36, r.h + 36);
    ctx.fillStyle = v.tint;
    ctx.globalAlpha = 0.2 + 0.08 * Math.sin(this.roomT * 2.4);
    ctx.fillRect(r.x - 18, r.y - 18, r.w + 36, r.h + 36);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = v.tint;
    ctx.lineWidth = 3;
    ctx.strokeRect(r.x, r.y, r.w, r.h);
    // Venue sign on the north wall.
    ctx.font = 'bold 26px Consolas, "Courier New", monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(2,3,9,0.7)';
    ctx.fillText(v.name, r.x + r.w / 2 + 2, r.y - 34 + 2);
    ctx.fillStyle = v.tint;
    ctx.fillText(v.name, r.x + r.w / 2, r.y - 34);

    // Furniture per spec, animated where the painter supports it.
    for (const key of v.furniture) {
      const fn = PAINT_FURNITURE[key];
      if (fn) fn(ctx, r, this.roomT);
    }

    // Patrons: seated silhouettes that sway a little.
    for (const s of this.patrons.get(v.id) ?? []) {
      const sway = Math.sin(this.roomT * 1.6 + s.phase) * 2;
      ctx.save();
      ctx.translate(sway, 0);
      ctx.fillStyle = s.color;
      ctx.beginPath(); ctx.arc(s.x, s.y - 16, 5, 0, TAU); ctx.fill();
      ctx.fillRect(s.x - 6, s.y - 11, 12, 22);
      ctx.restore();
    }

    // Pickups: the street glow language, bobbing.
    for (const it of this.items.get(v.id) ?? []) {
      if (it.dead) continue;
      const bob = Math.sin(this.roomT * 3 + it.phase) * 4;
      const color = it.kind === 'cash' ? '#7dffa4' : it.kind === 'health' ? '#ff6b5f' : it.kind === 'armor' ? '#5db3ff' : '#ffe9a3';
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.85;
      ctx.beginPath();
      ctx.arc(it.x, it.y + bob, 9, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 0.25;
      ctx.beginPath();
      ctx.arc(it.x, it.y + bob, 16, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    // The player: a top-down hero — jacket circle + heading tick.
    const p = g.player;
    ctx.fillStyle = '#e8ecf4';
    ctx.beginPath(); ctx.arc(p.x, p.y, 10, 0, TAU); ctx.fill();
    ctx.fillStyle = '#0b0e1e';
    ctx.beginPath(); ctx.arc(p.x + Math.cos(p.heading) * 6, p.y + Math.sin(p.heading) * 6, 4, 0, TAU); ctx.fill();

    // Exit pad glow on the west wall.
    const ex = r.x + 60, ey = r.y + r.h / 2;
    const pulse = 0.4 + 0.25 * Math.sin(this.roomT * 4);
    ctx.strokeStyle = `rgba(125,255,164,${pulse})`;
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(ex, ey, 26, 0, TAU); ctx.stroke();
    ctx.fillStyle = 'rgba(125,255,164,0.85)';
    ctx.font = 'bold 13px Consolas, "Courier New", monospace';
    ctx.fillText('EXIT', ex, ey - 34);

    ctx.restore();

    // Screen-space: the venue plate and the exit prompt when close.
    ctx.fillStyle = 'rgba(4,5,14,0.55)';
    plate(ctx, 24, 24, 300, 44);
    ctx.fill();
    ctx.textAlign = 'left';
    ctx.fillStyle = v.tint;
    ctx.font = 'bold 16px Consolas, "Courier New", monospace';
    ctx.fillText(v.name, 38, 44);
    ctx.fillStyle = '#9aa3b8';
    ctx.font = '12px Consolas, "Courier New", monospace';
    ctx.fillText('Interior — the world keeps running outside', 38, 60);
    const near = dist2(p.x, p.y, r.x + 60, r.y + r.h / 2) < 52 * 52;
    if (near) prompt(ctx, W, H, 'G', 'LEAVE', 1);
  }
}
