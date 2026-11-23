// ============================================================
// INTERIORS — the four venues that open their doors at night:
// Club Riviera, the Coral Diner, Rosa's garage bay and the
// 24-hour pawn shop.
//
// Walk to a door marker on foot, press G, and the room takes
// over the screen: themed furniture, patrons with idle
// animation, interior pickups on their own respawn clocks, and
// a glowing exit pad back to the street (E to step out). Dying
// inside an interior calls forceExit(), so the room never
// strands itself around a respawn point.
//
// Public API (what main.js / game.js / photoMode.js expect):
//   doors [{x,y,name,color}], inside, update(dt, input),
//   render(ctx, W, H), forceExit()
// ============================================================

import { PITCH } from '../config.js';
import { clamp } from '../util.js';
import { rand } from '../rng.js';

const ROOM_W = 960;
const ROOM_H = 560;
const PICKUP_RESPAWN = 40;
const MONO = 'Consolas, "Courier New", monospace';

// The venues. Doors sit on the sidewalk edges of their blocks,
// near the people who work them (Rosa's stoop, Serge's window).
const VENUES = [
  {
    id: 'riviera',
    name: 'CLUB RIVIERA',
    color: '#ff3fa4',
    door: { x: 10 * PITCH + 62, y: 15 * PITCH - 62 },
    floorA: '#1c1230', floorB: '#251542',
    wall: '#160b26',
    tagline: 'dance like the rent is due',
  },
  {
    id: 'diner',
    name: 'CORAL DINER',
    color: '#ffc042',
    door: { x: 26 * PITCH - 62, y: 27 * PITCH + 62 },
    floorA: '#d8d2c4', floorB: '#20242c',
    wall: '#2e2620',
    tagline: 'open all night, pie always',
  },
  {
    id: 'garage',
    name: "ROSA'S GARAGE",
    color: '#ff7a3c',
    door: { x: 12 * PITCH + 62, y: 27 * PITCH - 62 },
    floorA: '#3a3d44', floorB: '#33363c',
    wall: '#23262c',
    tagline: 'repo, repair, no questions',
  },
  {
    id: 'pawn',
    name: '24H PAWN',
    color: '#33e7ff',
    door: { x: 24 * PITCH + 62, y: 8 * PITCH - 62 },
    floorA: '#3a3126', floorB: '#332a20',
    wall: '#28221a',
    tagline: 'everything buys, nothing tells',
  },
];

export class Interiors {
  constructor(game) {
    this.game = game;
    this.doors = VENUES.map((v) => ({ ...v.door, name: v.name, color: v.color }));
    this.inside = false;
    this.venue = null;
    this.ix = ROOM_W / 2;
    this.iy = ROOM_H - 90;
    this.walkPhase = 0;
    this.time = 0;
    this.pickups = [];
    this.patrons = [];
    for (const v of VENUES) this.buildRoom(v);
  }

  /** Room contents per venue: pickups with respawn clocks and a few patrons. */
  buildRoom(v) {
    v.pickups = [
      { kind: 'cash', x: 180, y: 190, amount: 220, dead: false, respawnAt: 0 },
      { kind: v.id === 'garage' || v.id === 'pawn' ? 'health' : 'armor', x: ROOM_W - 200, y: 170, dead: false, respawnAt: 0 },
    ];
    v.patrons = [];
    const n = v.id === 'riviera' ? 6 : 4;
    for (let k = 0; k < n; k++) {
      v.patrons.push({
        x: 140 + (k % 3) * 240 + rand() * 60,
        y: 220 + Math.floor(k / 3) * 150 + rand() * 40,
        shirt: ['#d95f5f', '#5fa8d9', '#d9c15f', '#8bd98a', '#c46fd9'][k % 5],
        phase: rand() * 6.28,
        dance: v.id === 'riviera',
      });
    }
  }

  // ---------------------------------------------------------------- flow

  enter(v) {
    if (this.inside) return;
    this.inside = true;
    this.venue = v;
    this.ix = ROOM_W / 2;
    this.iy = ROOM_H - 80;
    this.walkPhase = 0;
    this.graceT = 0.25;     // the G that opened the door must not also work the exit pad
    this.game.audio.ensure();
    this.game.audio.blip(660);
    this.game.toast(`${v.name} — G took you in. E on the pad takes you out.`, v.color);
  }

  exit() {
    if (!this.inside) return;
    this.inside = false;
    this.venue = null;
    this.game.audio.blip(300);
  }

  /** Death inside a venue must not strand the room around the respawn. */
  forceExit() {
    this.inside = false;
    this.venue = null;
  }

  // ---------------------------------------------------------------- update

  update(dt, input) {
    const g = this.game;
    // Outside: the door prompt, then the G tap that takes you in.
    if (!this.inside) {
      const p = g.player;
      if (!p.car) {
        for (const d of this.doors) {
          if (Math.hypot(p.x - d.x, p.y - d.y) < 84) {
            g.hud?.setPrompt?.(`G — enter ${d.name}`);
            if (input?.tap('KeyG')) {
              const v = VENUES.find((x) => x.door.x === d.x && x.door.y === d.y);
              if (v) this.enter(v);
            }
            break;
          }
        }
      }
      return;
    }

    // Inside: the street holds the player at the door while the room runs.
    const p = g.player;
    p.x = this.venue.door.x;
    p.y = this.venue.door.y + 26;
    p.vx = 0; p.vy = 0;
    this.time += dt;
    this.graceT = Math.max(0, (this.graceT ?? 0) - dt);
    const gated = this.graceT > 0 ? { axis: () => ({ x: 0, y: 0 }), held: () => false, tap: () => false } : input;

    // Walk the room: axis moves Rico between the furniture.
    const ax = gated.axis();
    const speed = 190;
    const nx = clamp(this.ix + ax.x * speed * dt, 60, ROOM_W - 60);
    const ny = clamp(this.iy + ax.y * speed * dt, 130, ROOM_H - 50);
    if (!this.blocked(nx, ny)) { this.ix = nx; this.iy = ny; }
    else if (!this.blocked(nx, this.iy)) { this.ix = nx; }
    else if (!this.blocked(this.ix, ny)) { this.iy = ny; }
    if (ax.x !== 0 || ax.y !== 0) this.walkPhase += dt * 8;

    // Patrons idle.
    for (const q of this.venue.patrons) q.phase += dt * (q.dance ? 6 : 1.4);

    // Pickups with their own respawn clocks.
    for (const pk of this.venue.pickups) {
      if (pk.dead && this.time >= pk.respawnAt) pk.dead = false;
      if (!pk.dead && Math.hypot(pk.x - this.ix, pk.y - this.iy) < 30) {
        pk.dead = true;
        pk.respawnAt = this.time + PICKUP_RESPAWN;
        p.pickup(pk.kind, pk.amount);
      }
    }

    // The exit pad: E steps back into the night.
    const ex = ROOM_W / 2, ey = ROOM_H - 56;
    if (Math.hypot(this.ix - ex, this.iy - ey) < 46) {
      g.hud?.setPrompt?.('E — back to the street');
      if (gated.tap('KeyE') || gated.tap('KeyG')) this.exit();
    }
  }

  /** Furniture blocks the walk; a handful of rects per venue. */
  blocked(x, y) {
    const v = this.venue;
    if (!v) return false;
    for (const r of roomFurniture(v)) {
      if (x > r.x - 16 && x < r.x + r.w + 16 && y > r.y - 16 && y < r.y + r.h + 16) return true;
    }
    return false;
  }

  // ---------------------------------------------------------------- render

  render(ctx, W, H) {
    const v = this.venue;
    if (!v) return;
    // Fit the room to the screen, centered.
    const scale = Math.min(W / ROOM_W, H / ROOM_H);
    ctx.save();
    ctx.fillStyle = '#05060c';
    ctx.fillRect(0, 0, W, H);
    ctx.translate((W - ROOM_W * scale) / 2, (H - ROOM_H * scale) / 2);
    ctx.scale(scale, scale);

    // Floor.
    const tile = 48;
    for (let ty = 90; ty < ROOM_H; ty += tile) {
      for (let tx = 0; tx < ROOM_W; tx += tile) {
        ctx.fillStyle = ((tx / tile + ty / tile) % 2) ? v.floorA : v.floorB;
        ctx.fillRect(tx, ty, tile, tile);
      }
    }
    // Back wall with the venue's neon.
    ctx.fillStyle = v.wall;
    ctx.fillRect(0, 0, ROOM_W, 90);
    ctx.strokeStyle = v.color;
    ctx.lineWidth = 3;
    ctx.strokeRect(6, 6, ROOM_W - 12, 78);
    ctx.fillStyle = v.color;
    ctx.font = `bold 34px ${MONO}`;
    ctx.textAlign = 'center';
    ctx.fillText(v.name, ROOM_W / 2, 52);
    ctx.font = `12px ${MONO}`;
    ctx.fillStyle = 'rgba(220,225,240,0.55)';
    ctx.fillText(v.tagline, ROOM_W / 2, 74);

    // Furniture and patrons, then Rico, then the exit pad glow.
    this.drawRoom(ctx, v);
    for (const q of v.patrons) this.drawPatron(ctx, q, v);
    for (const pk of v.pickups) this.drawPickup(ctx, pk);
    this.drawRico(ctx);
    this.drawExitPad(ctx);

    ctx.restore();
  }

  drawRoom(ctx, v) {
    for (const r of roomFurniture(v)) {
      ctx.fillStyle = '#171a20';
      ctx.fillRect(r.x + 4, r.y + 5, r.w, r.h);
      ctx.fillStyle = r.color ?? '#3a3126';
      ctx.fillRect(r.x, r.y, r.w, r.h);
      if (r.detail) r.detail(ctx, r, this.time);
    }
    switch (v.id) {
      case 'riviera': {
        // Dance floor panels pulsing in sequence.
        for (let k = 0; k < 12; k++) {
          const px = 300 + (k % 4) * 90, py = 300 + Math.floor(k / 4) * 70;
          const on = (Math.floor(this.time * 2.4) + k) % 4 === 0;
          ctx.fillStyle = on ? 'rgba(255,63,164,0.35)' : 'rgba(51,231,255,0.10)';
          ctx.fillRect(px, py, 78, 58);
        }
        // DJ booth with a spinning platter.
        ctx.fillStyle = '#20242c';
        ctx.fillRect(430, 120, 120, 46);
        ctx.fillStyle = '#33e7ff';
        ctx.beginPath(); ctx.arc(470, 143, 12 + Math.sin(this.time * 8) * 1.5, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#ff3fa4';
        ctx.beginPath(); ctx.arc(510, 143, 9, 0, Math.PI * 2); ctx.fill();
        // Speaker stacks with a beat pulse.
        for (const sx of [250, 650]) {
          ctx.fillStyle = '#171a20';
          ctx.fillRect(sx, 116, 44, 96);
          ctx.strokeStyle = `rgba(255,63,164,${0.3 + 0.3 * Math.abs(Math.sin(this.time * 4))})`;
          ctx.lineWidth = 3;
          ctx.beginPath(); ctx.arc(sx + 22, 150, 12, 0, Math.PI * 2); ctx.stroke();
          ctx.beginPath(); ctx.arc(sx + 22, 190, 8, 0, Math.PI * 2); ctx.stroke();
        }
        break;
      }
      case 'diner': {
        // Counter stools.
        for (let k = 0; k < 5; k++) {
          ctx.fillStyle = '#c0392b';
          ctx.beginPath(); ctx.arc(360 + k * 60, 250, 10, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = 'rgba(0,0,0,0.4)';
          ctx.stroke();
        }
        // Jukebox glow, breathing with the music.
        const glow = 0.4 + 0.3 * Math.sin(this.time * 3);
        ctx.fillStyle = `rgba(255,192,66,${glow * 0.5})`;
        ctx.fillRect(120, 116, 70, 96);
        ctx.fillStyle = '#7a4a26';
        ctx.fillRect(126, 122, 58, 84);
        // The pie case, rotating its wares.
        ctx.fillStyle = 'rgba(255,255,255,0.12)';
        ctx.fillRect(760, 116, 120, 60);
        ctx.fillStyle = '#c98a3a';
        ctx.beginPath(); ctx.arc(790, 146, 16, Math.PI, 0); ctx.fill();
        ctx.beginPath(); ctx.arc(850, 146, 16, Math.PI, 0); ctx.fill();
        break;
      }
      case 'garage': {
        // The lift with the hoisted Vanta.
        ctx.fillStyle = '#20242c';
        ctx.fillRect(360, 150, 240, 22);
        ctx.fillStyle = '#19c6d8';
        ctx.fillRect(380, 106, 200, 46);
        ctx.fillStyle = 'rgba(140,190,225,0.6)';
        ctx.fillRect(470, 116, 24, 12);
        ctx.strokeStyle = '#3a3d44';
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.moveTo(370, 172); ctx.lineTo(370, 96);
        ctx.moveTo(590, 172); ctx.lineTo(590, 96);
        ctx.stroke();
        // Tool wall.
        ctx.fillStyle = '#26292f';
        ctx.fillRect(60, 116, 180, 70);
        ctx.strokeStyle = '#c9a54e';
        ctx.lineWidth = 2;
        for (let k = 0; k < 6; k++) {
          ctx.beginPath();
          ctx.moveTo(76 + k * 26, 124); ctx.lineTo(76 + k * 26, 176);
          ctx.stroke();
        }
        break;
      }
      case 'pawn': {
        // Glass counter with wares that catch the light.
        ctx.fillStyle = 'rgba(160,220,255,0.14)';
        ctx.fillRect(320, 170, 320, 60);
        ctx.strokeStyle = '#c9a54e';
        ctx.lineWidth = 2;
        ctx.strokeRect(320, 170, 320, 60);
        for (let k = 0; k < 8; k++) {
          const glint = 0.3 + 0.4 * Math.abs(Math.sin(this.time * 1.6 + k));
          ctx.fillStyle = `rgba(255,236,190,${glint})`;
          ctx.fillRect(336 + k * 38, 186, 12, 8);
        }
        // The 24H sign buzzing over the shelves.
        const buzz = Math.sin(this.time * 17) > 0.9 ? 0.4 : 1;
        ctx.fillStyle = `rgba(51,231,255,${0.8 * buzz})`;
        ctx.font = `bold 20px ${MONO}`;
        ctx.fillText('24 HOURS', ROOM_W - 130, 140);
        break;
      }
    }
  }

  drawPatron(ctx, q, v) {
    const bob = Math.sin(q.phase) * (q.dance ? 4 : 1.2);
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.beginPath(); ctx.ellipse(q.x, q.y + 18, 9, 4, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = q.shirt;
    roundRectPath(ctx, q.x - 8, q.y - 12 + bob, 16, 26, 5);
    ctx.fill();
    ctx.fillStyle = '#d9b091';
    ctx.beginPath(); ctx.arc(q.x, q.y - 20 + bob, 7, 0, Math.PI * 2); ctx.fill();
    if (q.dance && Math.sin(q.phase * 1.3) > 0.4) {
      ctx.strokeStyle = v.color;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(q.x + 8, q.y - 4 + bob);
      ctx.lineTo(q.x + 20, q.y - 18 + bob);
      ctx.stroke();
    }
  }

  drawPickup(ctx, pk) {
    if (pk.dead) return;
    const bob = Math.sin(this.time * 2.6 + pk.x) * 3;
    ctx.save();
    ctx.translate(pk.x, pk.y + bob);
    if (pk.kind === 'cash') {
      ctx.fillStyle = '#7dffa4';
      for (let k = 0; k < 3; k++) ctx.fillRect(-9, -2 + k * 3.4, 18, 2.6);
    } else {
      ctx.fillStyle = '#e8ecf4';
      roundRectPath(ctx, -9, -8, 18, 16, 3); ctx.fill();
      ctx.fillStyle = '#e04848';
      ctx.fillRect(-2.4, -6, 4.8, 12);
      ctx.fillRect(-7, -1.6, 14, 4.4);
    }
    ctx.restore();
  }

  drawRico(ctx) {
    const bob = Math.sin(this.walkPhase * 2) * 1.6;
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.beginPath(); ctx.ellipse(this.ix, this.iy + 16, 10, 4.4, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#1d2027';
    const step = Math.sin(this.walkPhase) * 3.4;
    ctx.fillRect(this.ix - 5, this.iy + 2 + step * 0.4, 4.4, 14);
    ctx.fillRect(this.ix + 1, this.iy + 2 - step * 0.4, 4.4, 14);
    ctx.fillStyle = '#e8ecf4';
    roundRectPath(ctx, this.ix - 6.4, this.iy - 16 + bob * 0.2, 12.8, 20, 4);
    ctx.fill();
    ctx.fillStyle = '#d9b091';
    ctx.beginPath(); ctx.arc(this.ix, this.iy - 23 + bob * 0.2, 5.6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#241a10';
    ctx.beginPath(); ctx.arc(this.ix, this.iy - 25 + bob * 0.2, 5.6, Math.PI, 0); ctx.fill();
  }

  drawExitPad(ctx) {
    const ex = ROOM_W / 2, ey = ROOM_H - 56;
    const pulse = 0.4 + 0.3 * Math.sin(this.time * 3.2);
    ctx.strokeStyle = `rgba(123,255,212,${pulse})`;
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.ellipse(ex, ey, 34, 15, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = 'rgba(123,255,212,0.12)';
    ctx.beginPath(); ctx.ellipse(ex, ey, 34, 15, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(200,210,230,0.6)';
    ctx.font = `10px ${MONO}`;
    ctx.textAlign = 'center';
    ctx.fillText('EXIT', ex, ey - 20);
  }
}

/** Furniture rects per venue: what the walk respects and what renders. */
function roundRectPath(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function roomFurniture(v) {
  switch (v.id) {
    case 'riviera': return [
      { x: 250, y: 116, w: 44, h: 96, color: '#171a20' },   // speaker
      { x: 650, y: 116, w: 44, h: 96, color: '#171a20' },   // speaker
      { x: 430, y: 120, w: 120, h: 46, color: '#20242c' },  // dj booth
      { x: 60, y: 220, w: 130, h: 90, color: '#2e2620' },   // bar
    ];
    case 'diner': return [
      { x: 330, y: 210, w: 300, h: 70, color: '#8a8f98' },  // counter
      { x: 120, y: 116, w: 70, h: 96, color: '#7a4a26' },   // jukebox
      { x: 760, y: 116, w: 120, h: 60, color: '#4a4e56' },  // pie case
      { x: 620, y: 360, w: 130, h: 80, color: '#5c4530' },  // booth
    ];
    case 'garage': return [
      { x: 360, y: 150, w: 240, h: 40, color: '#20242c' },  // lift
      { x: 60, y: 116, w: 180, h: 70, color: '#26292f' },   // tool wall
      { x: 700, y: 300, w: 150, h: 90, color: '#2e3138' },  // tire stack
      { x: 620, y: 120, w: 130, h: 70, color: '#3a3126' },  // desk
    ];
    case 'pawn': return [
      { x: 320, y: 170, w: 320, h: 60, color: '#4a4238' },  // counter
      { x: 60, y: 116, w: 200, h: 110, color: '#332a20' },  // shelves
      { x: 680, y: 116, w: 220, h: 110, color: '#332a20' }, // shelves
      { x: 100, y: 340, w: 170, h: 80, color: '#2b241c' },  // crates
    ];
    default: return [];
  }
}
