// ---------------------------------------------------------------------------
// render.js — painter for the night city. Layer order:
//   ground zones → water → sand → roads/markings → sidewalks → props →
//   decals → peds/cops/cars/player → building extrusions → glow pass (lamps,
//   neon, headlights, fires) → particles → weather tint → vignette.
// Plus the circular minimap and the camera (follow, speed zoom, shake).
// ---------------------------------------------------------------------------

import { CFG } from './config.js';
import { VIEW } from './view.js';
import { clamp, lerp, dist2, rgba, shade, headingDeg, TAU } from './util.js';

const COL = CFG.COL;

export class Renderer {
  constructor(canvas, worldRef) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.world = worldRef;
    this.cam = { x: worldRef.spawn.x, y: worldRef.spawn.y, zoom: CFG.ZOOM_FOOT };
    this.shakeMag = 0;
    this.time = 0;
    this._rot = 0;
  }

  shake(mag) {
    this.shakeMag = Math.min(this.shakeMag + mag, 22);
  }

  screenToWorld(sx, sy) {
    const z = this.cam.zoom;
    return {
      x: this.cam.x + (sx - VIEW.w / 2) / z,
      y: this.cam.y + (sy - VIEW.h / 2) / z,
    };
  }

  worldToScreen(wx, wy) {
    const z = this.cam.zoom;
    return {
      x: (wx - this.cam.x) * z + VIEW.w / 2,
      y: (wy - this.cam.y) * z + VIEW.h / 2,
    };
  }

  updateCamera(game, dt) {
    const p = game.player;
    let tx = p.x, ty = p.y;
    if (p.inCar) {
      // lead the camera in the direction of travel
      const c = p.inCar;
      tx += Math.cos(c.angle) * c.speed * 0.32;
      ty += Math.sin(c.angle) * c.speed * 0.32;
    }
    const k = p.inCar ? 4.2 : 6.5;
    this.cam.x = lerp(this.cam.x, tx, 1 - Math.exp(-k * dt));
    this.cam.y = lerp(this.cam.y, ty, 1 - Math.exp(-k * dt));
    let zTarget = CFG.ZOOM_FOOT;
    if (p.inCar) {
      const s01 = clamp(Math.abs(p.inCar.speed) / 500, 0, 1);
      zTarget = lerp(CFG.ZOOM_CAR_MAX, CFG.ZOOM_CAR_MIN, s01);
    }
    this.cam.zoom = lerp(this.cam.zoom, zTarget, 1 - Math.exp(-3 * dt));
    this.shakeMag = Math.max(0, this.shakeMag - dt * 26);
    this.time += dt;
  }

  render(game, dt) {
    const g = this.ctx;
    const cam = this.cam;
    const shx = this.shakeMag > 0.2 ? (Math.random() * 2 - 1) * this.shakeMag : 0;
    const shy = this.shakeMag > 0.2 ? (Math.random() * 2 - 1) * this.shakeMag : 0;

    g.save();
    g.clearRect(0, 0, VIEW.w, VIEW.h);
    g.fillStyle = '#0a0d12';
    g.fillRect(0, 0, VIEW.w, VIEW.h);
    g.translate(VIEW.w / 2 + shx, VIEW.h / 2 + shy);
    g.scale(cam.zoom, cam.zoom);
    g.translate(-cam.x, -cam.y);

    // visible world bounds (with margin)
    const halfW = VIEW.w / 2 / cam.zoom + 80, halfH = VIEW.h / 2 / cam.zoom + 80;
    this.vx0 = cam.x - halfW; this.vx1 = cam.x + halfW;
    this.vy0 = cam.y - halfH; this.vy1 = cam.y + halfH;

    this.drawGround(game);
    this.drawRoads(game);
    this.drawPropsUnder(game);
    this.drawDecals(game);
    this.drawMarkers(game);
    game.pickups.draw(g, game, this.time);
    if (game.garage) game.garage.drawWorld(g, this.time);
    this.drawPeds(game);
    this.drawCops(game);
    this.drawCars(game);
    this.drawPlayer(game);
    this.drawBuildings(game);
    game.police.helis.drawWorld(g, this.time);
    this.drawGlow(game);
    this.drawParticles(game);
    this.drawWorldTexts(game);

    g.restore();

    this.drawFlashAndVignette(game);
    this.drawMinimap(game);
  }

  // ------------------------------------------------------------------ ground
  drawGround(game) {
    const g = this.ctx;
    const Z = this.world.zones;
    // base
    g.fillStyle = '#20242b';
    g.fillRect(this.vx0, this.vy0, this.vx1 - this.vx0, this.vy1 - this.vy0);
    for (const z of Z) {
      if (z.x1 < this.vx0 || z.x0 > this.vx1 || z.y1 < this.vy0 || z.y0 > this.vy1) continue;
      const w = z.x1 - z.x0, h = z.y1 - z.y0;
      if (z.kind === 'water') {
        g.fillStyle = COL.water;
        g.fillRect(z.x0, z.y0, w, h);
        this.drawWater(game, z.x0, z.y0, w, h);
      } else if (z.kind === 'sand') {
        g.fillStyle = COL.sand;
        g.fillRect(z.x0, z.y0, w, h);
        g.fillStyle = COL.sandDark;
        for (let y = z.y0; y < z.y1; y += 90) {
          g.fillRect(z.x0 + ((y * 37) % 120), y + ((y * 13) % 40), 60 + ((y * 7) % 80), 3);
        }
      } else if (z.kind === 'grass') {
        g.fillStyle = COL.grass;
        g.fillRect(z.x0, z.y0, w, h);
        g.fillStyle = COL.grassDark;
        for (let i = 0; i < 26; i++) {
          const px = z.x0 + ((i * 197) % Math.max(w, 1));
          const py = z.y0 + ((i * 131) % Math.max(h, 1));
          g.fillRect(px, py, 3, 8);
        }
      } else if (z.kind === 'path') {
        g.fillStyle = COL.path;
        g.fillRect(z.x0, z.y0, w, h);
      } else if (z.kind === 'concrete') {
        g.fillStyle = COL.concreteDark;
        g.fillRect(z.x0, z.y0, w, h);
        g.strokeStyle = 'rgba(255,255,255,0.03)';
        g.lineWidth = 1;
        for (let x = z.x0; x < z.x1; x += 120) { g.beginPath(); g.moveTo(x, z.y0); g.lineTo(x, z.y1); g.stroke(); }
      } else if (z.kind === 'dirt') {
        g.fillStyle = COL.dirt;
        g.fillRect(z.x0, z.y0, w, h);
      } else if (z.kind === 'lot') {
        g.fillStyle = '#2a2e36';
        g.fillRect(z.x0, z.y0, w, h);
      } else if (z.kind === 'boardwalk') {
        g.fillStyle = '#6b5a40';
        g.fillRect(z.x0, z.y0, w, h);
        g.strokeStyle = 'rgba(40,32,20,0.6)';
        g.lineWidth = 1;
        for (let x = z.x0; x < z.x1; x += 26) {
          g.beginPath(); g.moveTo(x, z.y0); g.lineTo(x, z.y1); g.stroke();
        }
      } else if (z.kind === 'runway') {
        g.fillStyle = '#2b2f36';
        g.fillRect(z.x0, z.y0, w, h);
        // threshold + centreline
        g.fillStyle = 'rgba(230,235,240,0.75)';
        g.fillRect(z.x0 + 8, (z.y0 + z.y1) / 2 - 2, z.x1 - z.x0 - 16, 4);
        for (let x = z.x0 + 30; x < z.x1 - 30; x += 90) g.fillRect(x, (z.y0 + z.y1) / 2 - 10, 40, 3), g.fillRect(x, (z.y0 + z.y1) / 2 + 7, 40, 3);
        g.fillRect(z.x0 + 4, z.y0 + 6, 6, z.y1 - z.y0 - 12);
        g.fillRect(z.x1 - 10, z.y0 + 6, 6, z.y1 - z.y0 - 12);
      }
    }
  }

  drawWater(game, x0, y0, w, h) {
    const g = this.ctx;
    const t = this.time;
    g.strokeStyle = 'rgba(60,140,190,0.22)';
    g.lineWidth = 2;
    const yStart = Math.max(y0, this.vy0), yEnd = Math.min(y1h(), this.vy1);
    function y1h() { return y0 + h; }
    for (let y = yStart - ((t * 26) % 46); y < yEnd; y += 46) {
      if (y < y0) continue;
      g.beginPath();
      const xStart = Math.max(x0, this.vx0);
      const xEnd = Math.min(x0 + w, this.vx1);
      for (let x = xStart; x < xEnd; x += 26) {
        const yy = y + Math.sin((x + t * 60) * 0.02) * 4;
        if (x === xStart) g.moveTo(x, yy); else g.lineTo(x, yy);
      }
      g.stroke();
    }
  }

  // ------------------------------------------------------------------- roads
  drawRoads(game) {
    const g = this.ctx;
    for (const r of this.world.roadRects) {
      if (r.x2 < this.vx0 || r.x > this.vx1 || r.y2 < this.vy0 || r.y > this.vy1) continue;
      // sidewalk bands first
      g.fillStyle = COL.sidewalk;
      if (r.axis === 'v') {
        g.fillRect(r.x - CFG.SIDEWALK, r.y, r.w + CFG.SIDEWALK * 2, r.h);
      } else {
        g.fillRect(r.x, r.y - CFG.SIDEWALK, r.w, r.h + CFG.SIDEWALK * 2);
      }
      // asphalt
      g.fillStyle = COL.asphalt;
      g.fillRect(r.x, r.y, r.w, r.h);
    }
    // markings
    g.lineWidth = 2;
    for (const r of this.world.roadRects) {
      if (r.x2 < this.vx0 || r.x > this.vx1 || r.y2 < this.vy0 || r.y > this.vy1) continue;
      g.strokeStyle = 'rgba(210,215,225,0.16)';
      if (r.axis === 'v') {
        g.beginPath(); g.moveTo(r.x + 5, r.y); g.lineTo(r.x + 5, r.y2); g.stroke();
        g.beginPath(); g.moveTo(r.x2 - 5, r.y); g.lineTo(r.x2 - 5, r.y2); g.stroke();
        g.strokeStyle = 'rgba(201,180,88,0.5)';
        g.setLineDash([26, 22]);
        g.beginPath(); g.moveTo((r.x + r.x2) / 2, r.y); g.lineTo((r.x + r.x2) / 2, r.y2); g.stroke();
        g.setLineDash([]);
      } else {
        g.beginPath(); g.moveTo(r.x, r.y + 5); g.lineTo(r.x2, r.y + 5); g.stroke();
        g.beginPath(); g.moveTo(r.x, r.y2 - 5); g.lineTo(r.x2, r.y2 - 5); g.stroke();
        g.strokeStyle = 'rgba(201,180,88,0.5)';
        g.setLineDash([26, 22]);
        g.beginPath(); g.moveTo(r.x, (r.y + r.y2) / 2); g.lineTo(r.x2, (r.y + r.y2) / 2); g.stroke();
        g.setLineDash([]);
      }
    }
    // crosswalks at lighted intersections
    for (const n of this.world.nodes) {
      if (!n.lights) continue;
      if (n.x < this.vx0 || n.x > this.vx1 || n.y < this.vy0 || n.y > this.vy1) continue;
      g.fillStyle = 'rgba(225,230,240,0.35)';
      const R = HRW() - 8;
      for (let i = -3; i <= 3; i++) {
        g.fillRect(n.x + i * 12 - 4, n.y - R - 18, 8, 12);
        g.fillRect(n.x + i * 12 - 4, n.y + R + 6, 8, 12);
        g.fillRect(n.x - R - 18, n.y + i * 12 - 4, 12, 8);
        g.fillRect(n.x + R + 6, n.y + i * 12 - 4, 12, 8);
      }
      // signal heads
      const ph = game ? game.time % 19 : 0;
      const nsGo = ph < 8;
      g.fillStyle = nsGo ? '#3ddc6a' : '#ff4b4b';
      g.fillRect(n.x - R - 8, n.y - R - 8, 5, 5);
      g.fillStyle = nsGo ? '#ff4b4b' : '#3ddc6a';
      g.fillRect(n.x + R + 3, n.y + R + 3, 5, 5);
    }
  }

  // ------------------------------------------------------------------- props
  drawPropsUnder(game) {
    const g = this.ctx;
    // piers (planks)
    for (const p of this.world.piers) {
      if (p.x + p.w < this.vx0 || p.x > this.vx1 || p.y + p.h < this.vy0 || p.y > this.vy1) continue;
      g.fillStyle = '#54483a';
      g.fillRect(p.x, p.y, p.w, p.h);
      g.strokeStyle = 'rgba(30,25,18,0.5)';
      g.lineWidth = 1;
      for (let y = p.y; y < p.y + p.h; y += 12) {
        g.beginPath(); g.moveTo(p.x, y); g.lineTo(p.x + p.w, y); g.stroke();
      }
      g.strokeStyle = '#6b5d48';
      g.lineWidth = 3;
      g.strokeRect(p.x + 1, p.y + 1, p.w - 2, p.h - 2);
    }
    // containers
    for (const c of this.world.containers) {
      if (c.x + c.w < this.vx0 || c.x > this.vx1 || c.y + c.h < this.vy0 || c.y > this.vy1) continue;
      g.fillStyle = 'rgba(0,0,0,0.35)';
      g.fillRect(c.x + 3, c.y + 4, c.w, c.h);
      g.fillStyle = c.hue;
      g.fillRect(c.x, c.y, c.w, c.h);
      g.fillStyle = 'rgba(255,255,255,0.08)';
      for (let x = c.x + 4; x < c.x + c.w - 4; x += 8) g.fillRect(x, c.y + 2, 2, c.h - 4);
      g.strokeStyle = 'rgba(0,0,0,0.5)';
      g.lineWidth = 1;
      g.strokeRect(c.x, c.y, c.w, c.h);
    }
    // cranes
    for (const cr of this.world.cranes) {
      if (cr.x < this.vx0 - 300 || cr.x > this.vx1 + 300 || cr.y < this.vy0 - 300 || cr.y > this.vy1 + 300) continue;
      this.drawCrane(g, cr);
    }
    // ship
    const s = this.world.ship;
    if (s && s.x < this.vx1 + 100 && s.x + s.w > this.vx0 - 100) this.drawShip(g, s);
    // pier railings
    for (const p of this.world.piers) {
      if (p.x + p.w < this.vx0 || p.x > this.vx1 || p.y + p.h < this.vy0 || p.y > this.vy1) continue;
      g.fillStyle = '#7d6d52';
      for (let y = p.y + 6; y < p.y + p.h; y += 22) {
        g.fillRect(p.x + 1, y, 3, 3);
        g.fillRect(p.x + p.w - 4, y, 3, 3);
      }
      for (let x = p.x + 6; x < p.x + p.w; x += 22) {
        g.fillRect(x, p.y + 1, 3, 3);
        g.fillRect(x, p.y + p.h - 4, 3, 3);
      }
    }
    // parking lot stall lines
    for (const lot of this.world.parkingLots) {
      if (lot.x + lot.w < this.vx0 || lot.x > this.vx1 || lot.y + lot.h < this.vy0 || lot.y > this.vy1) continue;
      g.strokeStyle = 'rgba(225,230,215,0.28)';
      g.lineWidth = 2;
      for (const s of lot.stalls) {
        g.strokeRect(s.x - s.w / 2, s.y - s.h / 2, s.w, s.h);
      }
    }
    // hydrants
    g.fillStyle = '#a8352f';
    for (const h of this.world.hydrants) {
      if (h.x < this.vx0 || h.x > this.vx1 || h.y < this.vy0 || h.y > this.vy1) continue;
      g.fillRect(h.x - 3, h.y - 3, 6, 6);
      g.fillStyle = '#7d2620';
      g.fillRect(h.x - 1, h.y - 5, 2, 2);
      g.fillStyle = '#a8352f';
    }
    // dock hazard stripes along the quay edge
    if (this.world.site) { /* site handled below */ }
    g.save();
    for (let x = 240; x < 2300; x += 46) {
      if (x < this.vx0 - 60 || x > this.vx1 + 60) continue;
      g.fillStyle = x % 92 < 46 ? '#d8a020' : '#26262a';
      g.fillRect(x, CFG.WATER_N + 2, 40, 7);
    }
    g.restore();
    // "NO SWIMMING" sign at the pier foot (the paint faded years ago)
    if (this.world.piers.length) {
      const p0 = this.world.piers[0];
      if (p0.x > this.vx0 - 60 && p0.x < this.vx1 + 60 && p0.y < this.vy1 && p0.y + p0.h > this.vy0) {
        g.fillStyle = '#c8b06a';
        g.fillRect(p0.x - 34, p0.y + p0.h - 8, 44, 16);
        g.fillStyle = '#7a2a2a';
        g.font = 'bold 7px "Segoe UI", Arial, sans-serif';
        g.textAlign = 'center';
        g.fillText('NO SWIMMING', p0.x - 12, p0.y + p0.h + 4);
        g.textAlign = 'left';
      }
    }
    // dock bollards
    g.fillStyle = '#2c2620';
    for (const b of this.world.bollards) {
      if (b.x < this.vx0 || b.x > this.vx1 || b.y < this.vy0 || b.y > this.vy1) continue;
      g.beginPath(); g.arc(b.x, b.y, 5, 0, 7); g.fill();
      g.fillStyle = '#4a3d2e';
      g.beginPath(); g.arc(b.x, b.y, 2.4, 0, 7); g.fill();
      g.fillStyle = '#2c2620';
    }
    // beach umbrellas + towels
    for (const u of this.world.umbrellas) {
      if (u.x < this.vx0 - 40 || u.x > this.vx1 + 40 || u.y < this.vy0 - 40 || u.y > this.vy1 + 40) continue;
      if (u.towel) {
        g.save();
        g.translate(u.x + 14, u.y + 10);
        g.rotate(u.towelRot);
        g.fillStyle = 'rgba(230,235,240,0.5)';
        g.fillRect(-7, -12, 14, 24);
        g.restore();
      }
      g.fillStyle = 'rgba(0,0,0,0.35)';
      g.beginPath(); g.ellipse(u.x + 4, u.y + 5, u.r * 0.9, u.r * 0.5, 0, 0, 7); g.fill();
      for (let i = 0; i < 4; i++) {
        g.fillStyle = i % 2 ? u.hue : shade(u.hue, 0.6);
        g.beginPath();
        g.moveTo(u.x, u.y);
        g.arc(u.x, u.y, u.r, (i / 4) * TAU, ((i + 1) / 4) * TAU);
        g.closePath();
        g.fill();
      }
    }
    // park flowerbeds
    for (const b of this.world.beds) {
      if (b.x < this.vx0 || b.x > this.vx1 || b.y < this.vy0 || b.y > this.vy1) continue;
      g.fillStyle = '#3a3040';
      g.beginPath(); g.ellipse(b.x, b.y, b.w, b.w * 0.55, 0, 0, 7); g.fill();
      g.fillStyle = b.hue;
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * TAU + b.w;
        g.beginPath();
        g.arc(b.x + Math.cos(a) * b.w * 0.6, b.y + Math.sin(a) * b.w * 0.32, 2.4, 0, 7);
        g.fill();
      }
    }
    // runway edge lights (glow handled in the light pass)
    g.fillStyle = 'rgba(255,230,180,0.85)';
    for (const e of this.world.edgeLights) {
      if (e.x < this.vx0 || e.x > this.vx1 || e.y < this.vy0 || e.y > this.vy1) continue;
      g.fillRect(e.x - 1.5, e.y - 1.5, 3, 3);
    }
    // taxi rank shelters
    for (const r of this.world.taxiRanks) {
      if (r.x < this.vx0 - 60 || r.x > this.vx1 + 60 || r.y < this.vy0 - 60 || r.y > this.vy1 + 60) continue;
      g.save();
      g.translate(r.x, r.y);
      g.rotate(r.angle);
      g.fillStyle = 'rgba(0,0,0,0.4)';
      g.fillRect(-24, -10, 48, 22);
      g.fillStyle = '#39424e';
      g.fillRect(-26, -12, 52, 20);
      g.fillStyle = '#ffd23e';
      g.fillRect(-20, -8, 40, 4);
      g.restore();
    }
    // seagulls wheeling over the water (drawn above everything ground-level)
    for (const gl of this.world.gulls) {
      const a = gl.ph + this.time * gl.w;
      const gx = gl.cx + Math.cos(a) * gl.r;
      const gy = gl.cy + Math.sin(a) * gl.r * 0.6 + Math.sin(this.time * 2 + gl.ph) * gl.bob;
      if (gx < this.vx0 || gx > this.vx1 || gy < this.vy0 || gy > this.vy1) continue;
      const flap = Math.sin(this.time * 9 + gl.ph * 3) * 3;
      g.strokeStyle = 'rgba(225,232,240,0.8)';
      g.lineWidth = 1.6;
      g.beginPath();
      g.moveTo(gx - 5, gy - flap);
      g.quadraticCurveTo(gx, gy - 2, gx, gy);
      g.quadraticCurveTo(gx, gy - 2, gx + 5, gy - flap);
      g.stroke();
    }
    // median palms on the two big boulevards (planted in the asphalt border)
    for (const r of this.world.segRects) {
      if (r.road !== 'v2040' && r.road !== 'v1240') continue;
      for (let y = r.y + 240; y < r.y2 - 120; y += 480) {
        const px = r.x - HRW - 4;
        if (px < this.vx0 || px > this.vx1 || y < this.vy0 || y > this.vy1) continue;
        g.fillStyle = 'rgba(0,0,0,0.35)';
        g.beginPath(); g.ellipse(px + 3, y + 4, 10, 6, 0, 0, 7); g.fill();
        g.fillStyle = '#514028';
        g.fillRect(px - 2, y - 5, 4, 10);
        g.fillStyle = '#2f5d33';
        g.beginPath(); g.arc(px, y - 9, 8, 0, 7); g.fill();
      }
    }
    // construction site: pad, footings, cones, little tower crane
    const site = this.world.site;
    if (site && site.x < this.vx1 && site.x + site.w > this.vx0 && site.y < this.vy1 && site.y + site.h > this.vy0) {
      g.fillStyle = '#3a372e';
      g.fillRect(site.x, site.y, site.w, site.h);
      g.strokeStyle = 'rgba(230,140,50,0.9)';
      g.lineWidth = 4;
      g.setLineDash([16, 12]);
      g.strokeRect(site.x, site.y, site.w, site.h);
      g.setLineDash([]);
      for (const f of site.footings) {
        g.fillStyle = '#5a5245';
        g.fillRect(f.x, f.y, 44, 44);
        g.fillStyle = '#46402f';
        g.fillRect(f.x + 6, f.y + 6, 32, 32);
        for (let i = 0; i < 4; i++) {
          g.fillStyle = '#7d6a4e';
          g.fillRect(f.x + 8 + i * 9, f.y + 10, 3, 28);
        }
      }
      // tower crane
      const cx0 = site.craneX, cy0 = site.craneY;
      g.strokeStyle = '#c2782e';
      g.lineWidth = 6;
      g.beginPath(); g.moveTo(cx0, cy0); g.lineTo(cx0, cy0 - 130); g.stroke();
      g.lineWidth = 4;
      g.beginPath(); g.moveTo(cx0 - 90, cy0 - 120); g.lineTo(cx0 + 120, cy0 - 120); g.stroke();
      g.strokeStyle = 'rgba(220,220,220,0.8)';
      g.lineWidth = 1.5;
      g.beginPath(); g.moveTo(cx0 + 70, cy0 - 120); g.lineTo(cx0 + 70, cy0 - 40); g.stroke();
      g.fillStyle = '#7a5a2e';
      g.fillRect(cx0 + 58, cy0 - 40, 24, 14);
      // cones on the street edge
      for (const c of site.coneX) {
        g.fillStyle = '#e06a2e';
        g.beginPath(); g.arc(c.x, c.y, 5, 0, 7); g.fill();
        g.fillStyle = '#f0e8e0';
        g.beginPath(); g.arc(c.x, c.y, 2, 0, 7); g.fill();
      }
    }
    // runway extras handled in ground; palm/oak canopies on top of everything:
    this.drawTrees(game);
  }

  drawCrane(g, cr) {
    const mastH = 150;
    g.fillStyle = 'rgba(0,0,0,0.4)';
    g.fillRect(cr.x + 4, cr.y + 6, 34, 34);
    g.fillStyle = cr.hue;
    g.fillRect(cr.x, cr.y, 30, 30);
    const dir = cr.flip ? -1 : 1;
    // mast
    g.fillRect(cr.x + 8, cr.y - mastH, 14, mastH);
    // arm reaching over the pier
    g.fillRect(cr.x + 8 + (dir > 0 ? 0 : -150), cr.y - mastH, 150, 12);
    // cable + hook
    const cx = cr.x + 8 + (dir > 0 ? 118 : -118);
    g.strokeStyle = '#d8d8d8';
    g.lineWidth = 2;
    g.beginPath(); g.moveTo(cx, cr.y - mastH + 12); g.lineTo(cx, cr.y - 40); g.stroke();
    g.fillStyle = '#7a5a2e';
    g.fillRect(cx - 14, cr.y - 40, 28, 16);
  }

  drawShip(g, s) {
    g.fillStyle = 'rgba(0,0,0,0.45)';
    g.fillRect(s.x + 6, s.y + 8, s.w, s.h);
    g.fillStyle = COL.ship;
    g.fillRect(s.x, s.y, s.w, s.h);
    g.fillStyle = '#2c333f';
    g.fillRect(s.x + 12, s.y + 10, s.w - 24, s.h - 20);
    // bridge
    g.fillStyle = '#e8e8e0';
    g.fillRect(s.x + s.w / 2 - s.bridge / 2, s.y + s.h - 60, s.bridge, 40);
    g.fillStyle = '#2c333f';
    g.fillRect(s.x + s.w / 2 - s.bridge / 2 + 6, s.y + s.h - 54, s.bridge - 12, 12);
    // containers on deck
    g.fillStyle = '#7a4a2e';
    g.fillRect(s.x + 30, s.y + 30, 44, 18);
    g.fillStyle = '#2e6e5a';
    g.fillRect(s.x + 30, s.y + 54, 44, 18);
    g.fillStyle = '#3d4a7a';
    g.fillRect(s.x + s.w - 74, s.y + 30, 44, 18);
  }

  drawTrees(game) {
    const g = this.ctx;
    for (const p of this.world.palms) {
      if (p.x < this.vx0 - 40 || p.x > this.vx1 + 40 || p.y < this.vy0 - 40 || p.y > this.vy1 + 40) continue;
      g.fillStyle = 'rgba(0,0,0,0.4)';
      g.beginPath(); g.ellipse(p.x + 5, p.y + 6, p.r * 1.1, p.r * 0.7, 0, 0, 7); g.fill();
      if (p.kind === 'palm') {
        g.strokeStyle = '#6e5a3a';
        g.lineWidth = 5;
        g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(p.x - 4, p.y - p.r * 1.4); g.stroke();
        g.strokeStyle = '#3f7a3d';
        g.lineWidth = 4;
        for (let i = 0; i < 6; i++) {
          const a = -Math.PI / 2 + (i - 2.5) * 0.55 + Math.sin(this.time * 0.8 + p.x) * 0.05;
          g.beginPath();
          g.moveTo(p.x - 4, p.y - p.r * 1.4);
          g.quadraticCurveTo(
            p.x - 4 + Math.cos(a) * p.r * 1.2, p.y - p.r * 1.4 + Math.sin(a) * p.r * 1.2,
            p.x - 4 + Math.cos(a) * p.r * 1.9, p.y - p.r * 1.4 + Math.sin(a) * p.r * 1.9 + 6,
          );
          g.stroke();
        }
      } else {
        g.fillStyle = '#514028';
        g.fillRect(p.x - 3, p.y - 6, 6, 12);
        g.fillStyle = '#2f5d33';
        g.beginPath(); g.arc(p.x, p.y - 10, p.r * 1.05, 0, 7); g.fill();
        g.fillStyle = '#3a6e3d';
        g.beginPath(); g.arc(p.x - 4, p.y - 14, p.r * 0.6, 0, 7); g.fill();
      }
    }
  }

  // ------------------------------------------------------------------ decals
  drawDecals(game) {
    const g = this.ctx;
    for (const d of game.fx.decals) {
      if (d.x < this.vx0 || d.x > this.vx1 || d.y < this.vy0 || d.y > this.vy1) continue;
      if (d.kind === 'blood') {
        g.fillStyle = rgba(COL.blood, d.a);
        g.beginPath(); g.ellipse(d.x, d.y, d.r, d.r * 0.72, d.rot, 0, 7); g.fill();
      } else if (d.kind === 'skid') {
        g.fillStyle = rgba(COL.skid, d.a);
        g.fillRect(d.x - 2, d.y - 2, 4, 4);
      } else if (d.kind === 'casing') {
        g.fillStyle = rgba('#c8a028', d.a);
        g.fillRect(d.x - 1.5, d.y - 0.75, 3, 1.5);
      } else if (d.kind === 'scorch') {
        g.fillStyle = rgba('#0c0c0e', d.a);
        g.beginPath(); g.arc(d.x, d.y, d.r, 0, 7); g.fill();
      }
    }
  }

  // ----------------------------------------------------------------- markers
  drawMarkers(game) {
    const g = this.ctx;
    const list = game.missions.markers();
    const t = this.time;
    // roadblock cones (police prop, fades with the block's timer)
    for (const c of game.police.roadblocks) {
      if (c.x < this.vx0 || c.x > this.vx1 || c.y < this.vy0 || c.y > this.vy1) continue;
      g.save();
      g.globalAlpha = Math.min(1, c.t / 3);
      g.fillStyle = '#e06a2e';
      g.beginPath(); g.arc(c.x, c.y, 6, 0, 7); g.fill();
      g.fillStyle = '#f0e8e0';
      g.beginPath(); g.arc(c.x, c.y, 2.4, 0, 7); g.fill();
      g.restore();
    }
    for (const m of list) {
      if (m.x < this.vx0 - 60 || m.x > this.vx1 + 60 || m.y < this.vy0 - 60 || m.y > this.vy1 + 60) continue;
      const pulse = 0.55 + 0.45 * Math.sin(t * 4);
      const col = m.kind === 'story' ? '#3fd9ff' : m.kind === 'side' ? '#8bff5e' : m.kind === 'checkpoint' ? '#ffd23e' : '#ff4d9d';
      const r = (m.kind === 'checkpoint' ? 26 : 30) + pulse * 4;
      g.save();
      g.globalAlpha = 0.75;
      g.strokeStyle = col;
      g.lineWidth = 3;
      g.beginPath(); g.arc(m.x, m.y, r, 0, 7); g.stroke();
      g.globalAlpha = 0.16 + pulse * 0.12;
      g.fillStyle = col;
      g.beginPath(); g.arc(m.x, m.y, r, 0, 7); g.fill();
      g.restore();
    }
    // Rico when following
    const d = game.missions.data;
    if (game.missions.state === 'active' && d && d.rico && !d.ricoAboard) {
      this.drawPerson(g, d.rico.x, d.rico.y, 0, '#d8ae86', '#e8b820', '#2e3440', 0, false);
    }
  }

  // ----------------------------------------------------------------- people
  drawPeds(game) {
    const g = this.ctx;
    for (const p of game.peds.list) {
      if (p.x < this.vx0 - 30 || p.x > this.vx1 + 30 || p.y < this.vy0 - 30 || p.y > this.vy1 + 30) continue;
      if (p.state === 'dead') {
        g.save();
        g.translate(p.x, p.y);
        g.rotate(p.angle);
        g.globalAlpha = Math.max(0, 1 - p.deadT / 25);
        g.fillStyle = p.shirt;
        g.fillRect(-8, -4, 16, 8);
        g.fillStyle = p.skin;
        g.fillRect(8, -3, 6, 6);
        g.restore();
        continue;
      }
      // sunbathers lie flat on their towel
      if (p.kind === 'sunbather') {
        g.save();
        g.translate(p.x, p.y);
        g.rotate(p.angle);
        g.fillStyle = 'rgba(230,235,240,0.5)';
        g.fillRect(-12, -6, 24, 12);
        g.fillStyle = p.skin;
        g.beginPath(); g.arc(10, 0, 4.5, 0, 7); g.fill();
        g.fillStyle = p.shirt;
        g.fillRect(-2, -4, 10, 8);
        g.restore();
        continue;
      }
      this.drawPerson(g, p.x, p.y, p.angle, p.skin, p.shirt, p.pants, p.walkPhase, false, p.kind);
    }
  }

  drawCops(game) {
    const g = this.ctx;
    for (const c of game.police.cops) {
      if (c.x < this.vx0 - 30 || c.x > this.vx1 + 30 || c.y < this.vy0 - 30 || c.y > this.vy1 + 30) continue;
      this.drawPerson(g, c.x, c.y, c.angle, c.skin, c.shirt, c.pants, c.walkPhase, true);
      // arrest grab: a taut line to the player while busting
      if (c.arresting && !game.player.inCar) {
        g.strokeStyle = 'rgba(120,160,255,0.8)';
        g.lineWidth = 2;
        g.beginPath();
        g.moveTo(c.x, c.y);
        g.lineTo(game.player.x, game.player.y);
        g.stroke();
        if (Math.floor(this.time * 6) % 2 === 0) {
          g.font = 'bold 11px "Segoe UI", Arial, sans-serif';
          g.fillStyle = '#8fb0ff';
          g.textAlign = 'center';
          g.fillText('STOP! STOP!', c.x, c.y - 22);
          g.textAlign = 'left';
        }
      }
    }
  }

  drawPerson(g, x, y, angle, skin, shirt, pants, phase, hat, kind) {
    g.save();
    g.translate(x, y);
    g.fillStyle = 'rgba(0,0,0,0.4)';
    g.beginPath(); g.ellipse(2, 3, 9, 6, 0, 0, 7); g.fill();
    g.rotate(angle);
    const lp = Math.sin(phase) * 4;
    g.fillStyle = pants;
    g.fillRect(-2, -6 + lp * 0.5, 8, 4);
    g.fillRect(-2, 2 - lp * 0.5, 8, 4);
    // body — joggers lean, dog walkers box a little wider
    g.fillStyle = shirt;
    if (kind === 'jogger') {
      g.fillRect(-7, -5, 12, 10);
    } else if (kind === 'dogwalker') {
      g.fillRect(-6, -7, 12, 14);
    } else {
      g.fillRect(-6, -6, 12, 12);
    }
    g.fillStyle = skin;
    g.fillRect(2, -8, 6, 3);
    g.fillRect(2, 5, 6, 3);
    // head (+ cap for joggers)
    g.fillStyle = skin;
    g.beginPath(); g.arc(2, 0, 5, 0, 7); g.fill();
    if (hat) {
      g.fillStyle = '#1c2440';
      g.fillRect(-1, -5, 7, 10);
      g.fillRect(-4, -2, 3, 4);
    } else if (kind === 'jogger') {
      g.fillStyle = '#e0e0e0';
      g.fillRect(-2, -5, 7, 4);
    }
    // the dog
    if (kind === 'dogwalker') {
      g.fillStyle = '#8a6f4e';
      g.fillRect(-16, -3, 9, 5);
      g.fillRect(-19, -4, 4, 4);
      g.fillRect(-16, 2, 2, 4);
      g.fillRect(-11, 2, 2, 4);
      g.strokeStyle = 'rgba(200,200,200,0.6)';
      g.lineWidth = 1;
      g.beginPath(); g.moveTo(-4, 0); g.lineTo(-8, 0); g.stroke();
    }
    g.restore();
  }

  // ------------------------------------------------------------------- cars
  drawCars(game) {
    const g = this.ctx;
    const cars = game.allCars();
    for (const c of cars) {
      if (c.x < this.vx0 - 90 || c.x > this.vx1 + 90 || c.y < this.vy0 - 90 || c.y > this.vy1 + 90) continue;
      this.drawCar(g, c, game);
    }
  }

  drawCar(g, c, game) {
    const spec = c.spec;
    g.save();
    g.translate(c.x, c.y);
    // shadow
    g.fillStyle = 'rgba(0,0,0,0.42)';
    g.save();
    g.rotate(c.angle);
    g.fillRect(-spec.len / 2 + 3, -spec.wid / 2 + 4, spec.len, spec.wid);
    g.restore();
    g.rotate(c.angle);
    const L = spec.len, Wd = spec.wid;
    const hue = c.wrecked ? COL.wreck : spec.hue[c.variant % spec.hue.length];

    if (c.wrecked) {
      // burnt hulk
      g.fillStyle = '#17181a';
      g.fillRect(-L / 2, -Wd / 2, L, Wd);
      g.fillStyle = '#222326';
      g.fillRect(-L / 2 + 3, -Wd / 2 + 3, L - 6, Wd - 6);
      g.fillStyle = '#0e0f10';
      g.fillRect(-L * 0.18, -Wd / 2 + 3, L * 0.4, Wd - 6);
      g.restore();
      return;
    }

    // body
    g.fillStyle = hue;
    this._roundRect(g, -L / 2, -Wd / 2, L, Wd, 4);
    g.fill();
    // top highlight
    g.fillStyle = 'rgba(255,255,255,0.07)';
    this._roundRect(g, -L / 2 + 2, -Wd / 2 + 2, L - 4, Wd * 0.4, 3);
    g.fill();

    if (c.type === 'bus') {
      // windows row
      g.fillStyle = 'rgba(160,200,230,0.5)';
      for (let x = -L / 2 + 8; x < L / 2 - 12; x += 14) g.fillRect(x, -Wd / 2 + 3, 8, Wd - 6);
    } else {
      // cabin
      g.fillStyle = 'rgba(140,180,210,0.55)';
      g.fillRect(L * 0.05, -Wd / 2 + 3, L * 0.3, Wd - 6);       // windshield
      g.fillRect(-L * 0.32, -Wd / 2 + 3, L * 0.28, Wd - 6);     // rear glass
      // roof
      g.fillStyle = shade(hue, 0.82);
      g.fillRect(-L * 0.06, -Wd / 2 + 2, L * 0.12, Wd - 4);
      if (c.type === 'pickup') {
        g.fillStyle = shade(hue, 0.7);
        g.fillRect(-L / 2 + 3, -Wd / 2 + 3, L * 0.3, Wd - 6);
      }
      if (c.type === 'van') {
        g.fillStyle = 'rgba(140,180,210,0.4)';
        g.fillRect(-L / 2 + 4, -Wd / 2 + 4, L * 0.2, Wd - 8);
      }
    }
    if (c.type === 'taxi') {
      g.fillStyle = '#1a1a1a';
      g.fillRect(-6, -4, 12, 8);
      g.fillStyle = '#ffd23e';
      g.fillRect(-4, -3, 8, 6);
    }
    if (c.type === 'police') {
      // lightbar
      const t = game ? game.time : 0;
      const blink = Math.floor(t * 6) % 2 === 0;
      g.fillStyle = '#111';
      g.fillRect(-6, -Wd / 2 + 1, 12, Wd - 2);
      g.fillStyle = blink ? '#ff3b3b' : '#3b6bff';
      g.fillRect(-6, -Wd / 2 + 2, 12, (Wd - 2) / 2);
      g.fillStyle = blink ? '#3b6bff' : '#ff3b3b';
      g.fillRect(-6, 0, 12, (Wd - 2) / 2);
      // livery
      g.fillStyle = 'rgba(255,255,255,0.75)';
      g.fillRect(-L / 2 + 4, -2, L - 8, 4);
    }
    // headlights & taillights
    g.fillStyle = '#e8e2b0';
    g.fillRect(L / 2 - 3, -Wd / 2 + 2, 3, 4);
    g.fillRect(L / 2 - 3, Wd / 2 - 6, 3, 4);
    g.fillStyle = c.braking ? '#ff5050' : '#b03030';
    g.fillRect(-L / 2, -Wd / 2 + 2, 3, 4);
    g.fillRect(-L / 2, Wd / 2 - 6, 3, 4);
    if (c.reversing) {
      g.fillStyle = '#e8e8d8';
      g.fillRect(-L / 2, -Wd / 2 + 2, 3, 4);
      g.fillRect(-L / 2, Wd / 2 - 6, 3, 4);
    }
    // turn signals
    if (c.signal) {
      if (Math.floor((game && game.time ? game.time * 3 : 0)) % 2 === 0) {
        g.fillStyle = '#ff9a30';
        const sy = c.signal > 0 ? 1 : -1;
        g.fillRect(L / 2 - 4, sy > 0 ? Wd / 2 - 7 : 3, 4, 4);
        g.fillRect(-L / 2, sy > 0 ? Wd / 2 - 7 : 3, 4, 4);
      }
    }
    this._carKit(g, c, L, Wd, game);
    // cracked glass when hurt
    if (c.damage01 > 0.4) {
      g.strokeStyle = 'rgba(220,230,240,0.5)';
      g.lineWidth = 1;
      const cx0 = L * 0.18, cy0 = 0;
      g.beginPath();
      g.moveTo(cx0 - 4, cy0 - 3); g.lineTo(cx0 + 2, cy0 - 1);
      g.moveTo(cx0 - 3, cy0 + 2); g.lineTo(cx0 + 3, cy0 - 2);
      g.moveTo(cx0, cy0 - 4); g.lineTo(cx0 - 1, cy0 + 3);
      g.stroke();
    }
    // wheels
    g.fillStyle = '#101114';
    const wPh = Math.sin(game && game.time ? game.time * 8 : 0);
    g.fillRect(L * 0.22, -Wd / 2 - 2 + wPh * c.steerVis * 2, 8, 4);
    g.fillRect(L * 0.22, Wd / 2 - 2 + wPh * c.steerVis * 2, 8, 4);
    g.fillRect(-L * 0.32, -Wd / 2 - 2, 8, 4);
    g.fillRect(-L * 0.32, Wd / 2 - 2, 8, 4);
    g.restore();
  }

  _roundRect(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }

  /** per-type body kit details layered over the base body */
  _carKit(g, c, L, Wd, game) {
    const hue = c.spec.hue[c.variant % c.spec.hue.length];
    switch (c.type) {
      case 'sports':
      case 'super': {
        // rear wing
        g.fillStyle = '#14161a';
        g.fillRect(-L / 2 - 2, -Wd / 2 + 3, 4, Wd - 6);
        g.fillRect(-L / 2 + 2, -Wd / 2 + 6, 6, 3);
        g.fillRect(-L / 2 + 2, Wd / 2 - 9, 6, 3);
        // side stripes
        g.fillStyle = 'rgba(255,255,255,0.25)';
        g.fillRect(-L * 0.1, -Wd / 2 + 1, L * 0.55, 2);
        g.fillRect(-L * 0.1, Wd / 2 - 3, L * 0.55, 2);
        break;
      }
      case 'taxi': {
        // door sign + roof light glow
        g.fillStyle = 'rgba(255,255,255,0.6)';
        g.font = 'bold 6px "Segoe UI", Arial, sans-serif';
        g.save();
        g.rotate(-c.angle); // counter-rotate text (kept tiny)
        g.restore();
        break;
      }
      case 'van': {
        // cargo ties on the roof
        g.strokeStyle = 'rgba(20,22,26,0.8)';
        g.lineWidth = 2;
        g.beginPath();
        g.moveTo(-L * 0.2, -Wd / 2); g.lineTo(-L * 0.2, Wd / 2);
        g.moveTo(L * 0.05, -Wd / 2); g.lineTo(L * 0.05, Wd / 2);
        g.stroke();
        break;
      }
      case 'pickup': {
        // bed rails
        g.strokeStyle = shade(hue, 0.6);
        g.lineWidth = 2;
        g.strokeRect(-L / 2 + 3, -Wd / 2 + 3, L * 0.3, Wd - 6);
        break;
      }
      case 'bus': {
        // door lines mid-body
        g.strokeStyle = 'rgba(20,22,26,0.8)';
        g.lineWidth = 1.5;
        g.beginPath();
        g.moveTo(L * 0.18, -Wd / 2 + 2); g.lineTo(L * 0.18, Wd / 2 - 2);
        g.stroke();
        break;
      }
      case 'police': {
        // push bar
        g.fillStyle = '#1a1e28';
        g.fillRect(L / 2 - 2, -Wd / 2 + 3, 3, Wd - 6);
        // door number plate
        g.fillStyle = 'rgba(255,255,255,0.6)';
        g.fillRect(-2, -3, 8, 6);
        break;
      }
      default: {
        // mirrors for the humble commuters
        g.fillStyle = shade(hue, 0.7);
        g.fillRect(L * 0.12, -Wd / 2 - 2, 3, 3);
        g.fillRect(L * 0.12, Wd / 2 - 1, 3, 3);
      }
    }
  }

  drawPlayer(game) {
    const g = this.ctx;
    const p = game.player;
    if (p.inCar) return; // inside the car
    g.save();
    if (p.hurtT > 0) g.globalAlpha = 0.5 + 0.5 * Math.sin(p.hurtT * 40);
    this.drawPerson(g, p.x, p.y, p.angle, p.skin, p.shirt, p.pants, p.walkPhase, false);
    // pistol in hand
    if (p.weapon === 'pistol') {
      g.save();
      g.translate(p.x, p.y);
      g.rotate(p.aimAngle);
      g.fillStyle = '#22242a';
      g.fillRect(10, -2, 8, 3);
      g.restore();
    }
    g.restore();
  }

  // -------------------------------------------------------------- buildings
  drawBuildings(game) {
    const g = this.ctx;
    for (const b of this.world.buildings) {
      if (b.x + b.w < this.vx0 || b.x > this.vx1 || b.y + b.h < this.vy0 || b.y > this.vy1) continue;
      const ox = -b.ht * 0.22, oy = -b.ht * 0.3;
      // south face
      g.fillStyle = b.wall;
      g.beginPath();
      g.moveTo(b.x, b.y + b.h);
      g.lineTo(b.x + b.w, b.y + b.h);
      g.lineTo(b.x + b.w + ox, b.y + b.h + oy);
      g.lineTo(b.x + ox, b.y + b.h + oy);
      g.closePath();
      g.fill();
      // east face
      g.beginPath();
      g.moveTo(b.x + b.w, b.y);
      g.lineTo(b.x + b.w, b.y + b.h);
      g.lineTo(b.x + b.w + ox, b.y + b.h + oy);
      g.lineTo(b.x + b.w + ox, b.y + oy);
      g.closePath();
      g.fill();
      // windows on faces
      this._windows(g, b, ox, oy);
      // roof
      g.fillStyle = b.roof;
      g.fillRect(b.x + ox, b.y + oy, b.w, b.h);
      g.fillStyle = 'rgba(255,255,255,0.05)';
      g.fillRect(b.x + ox, b.y + oy, b.w, 4);
      if (b.arch) { // hangar arch hint
        g.strokeStyle = 'rgba(255,255,255,0.12)';
        g.lineWidth = 2;
        g.beginPath();
        g.moveTo(b.x + ox + 8, b.y + oy + b.h - 10);
        g.quadraticCurveTo(b.x + ox + b.w / 2, b.y + oy - 14, b.x + ox + b.w - 8, b.y + oy + b.h - 10);
        g.stroke();
      }
      if (b.flat) { // warehouse parapet
        g.strokeStyle = 'rgba(0,0,0,0.4)';
        g.lineWidth = 3;
        g.strokeRect(b.x + ox + 3, b.y + oy + 3, b.w - 6, b.h - 6);
      }
      // roof edge
      g.strokeStyle = 'rgba(0,0,0,0.5)';
      g.lineWidth = 1.5;
      g.strokeRect(b.x + ox, b.y + oy, b.w, b.h);
      // rooftop AC units + billboards
      for (const ac of this.world.acUnits) {
        if (ac.x < b.x || ac.x > b.x + b.w || ac.y < b.y || ac.y > b.y + b.h) continue;
        g.fillStyle = '#39404e';
        g.fillRect(ac.x + ox, ac.y + oy, ac.w, ac.w * 0.7);
        g.fillStyle = '#2c3240';
        g.fillRect(ac.x + ox + 2, ac.y + oy + 2, ac.w - 4, ac.w * 0.7 - 4);
      }
      for (const bb of this.world.billboards) {
        if (bb.x < b.x || bb.x > b.x + b.w || bb.y < b.y || bb.y > b.y + b.h) continue;
        const bx = bb.x - bb.w / 2 + ox, by = bb.y + oy - 8;
        g.fillStyle = '#10141c';
        g.fillRect(bx - 4, by - 4, bb.w + 8, 24);
        g.fillStyle = '#1a2030';
        g.fillRect(bx, by, bb.w, 16);
        g.font = 'bold 11px "Segoe UI", Arial, sans-serif';
        g.textAlign = 'center';
        g.fillStyle = bb.hue;
        g.fillText(bb.text, bb.x + ox, by + 12);
        g.textAlign = 'left';
      }
    }
  }

  _windows(g, b, ox, oy) {
    // only if the face is big enough
    const flick = (this.time * 0.7 + b.x * 0.13) % 12 < 11.6 ? 1 : 0.55; // occasional window flicker
    g.fillStyle = `rgba(255,225,150,${0.24 * flick})`;
    // south face windows
    const cols = Math.max(1, Math.floor(b.w / 26));
    const rows = Math.max(1, Math.floor(b.ht / 22));
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rows; j++) {
        if (((i * 7 + j * 13 + b.w | 0) % 5) === 0) continue; // some dark
        const wx = b.x + 8 + i * (b.w - 16) / cols;
        const wy = b.y + b.h + 6 + j * (b.ht / rows) * 0.8;
        if (wy < b.y + b.h + b.ht * 0.8) g.fillRect(wx + ox * 0.3, wy + oy * 0.3, 10, 6);
      }
    }
  }

  // ------------------------------------------------------------------- glow
  drawGlow(game) {
    const g = this.ctx;
    g.save();
    g.globalCompositeOperation = 'lighter';

    // street lamp pools
    for (const l of this.world.lamps) {
      if (l.x < this.vx0 - 60 || l.x > this.vx1 + 60 || l.y < this.vy0 - 60 || l.y > this.vy1 + 60) continue;
      const gr = g.createRadialGradient(l.x, l.y, 4, l.x, l.y, 66);
      gr.addColorStop(0, 'rgba(255,214,140,0.16)');
      gr.addColorStop(1, 'rgba(255,214,140,0)');
      g.fillStyle = gr;
      g.fillRect(l.x - 66, l.y - 66, 132, 132);
      g.fillStyle = 'rgba(255,230,180,0.8)';
      g.beginPath(); g.arc(l.x, l.y, 2.5, 0, 7); g.fill();
    }

    // wet-road sheen when rain has been falling
    const wet = game.weather ? game.weather.wet : 0;
    if (wet > 0.05) {
      g.fillStyle = `rgba(150,185,235,${0.045 * wet})`;
      for (const r of this.world.roadRects) {
        if (r.x2 < this.vx0 || r.x > this.vx1 || r.y2 < this.vy0 || r.y > this.vy1) continue;
        g.fillRect(r.x, r.y, r.w, r.h);
      }
      // standing puddles (shimmer with the wave clock)
      if (wet > 0.4) {
        for (const r of this.world.roadRects) {
          if (r.x2 < this.vx0 || r.x > this.vx1 || r.y2 < this.vy0 || r.y > this.vy1) continue;
          const seed = r.x + r.y;
          for (let i = 0; i < 3; i++) {
            const px = r.x + ((seed * (i + 3)) % Math.max(r.w - 30, 1)) + 15;
            const py = r.y + ((seed * (i + 7)) % Math.max(r.h - 30, 1)) + 15;
            const shim = 0.10 + 0.05 * Math.sin(this.time * 2.4 + seed + i * 2);
            g.fillStyle = `rgba(180,205,240,${shim})`;
            g.beginPath();
            g.ellipse(px, py, 16 + (i * 7), 8 + (i * 3), 0, 0, 7);
            g.fill();
          }
        }
      }
      // smeared lamp reflections
      for (const l of this.world.lamps) {
        if (l.x < this.vx0 - 60 || l.x > this.vx1 + 60 || l.y < this.vy0 - 60 || l.y > this.vy1 + 60) continue;
        g.fillStyle = `rgba(255,214,140,${0.10 * wet})`;
        g.beginPath();
        g.ellipse(l.x, l.y + 34, 10, 30, 0, 0, 7);
        g.fill();
      }
    }

    // headlight cones + taillights for every visible car
    const cars = game.allCars();
    for (const c of cars) {
      if (c.wrecked || !c.lightsOn) continue;
      if (c.x < this.vx0 - 200 || c.x > this.vx1 + 200 || c.y < this.vy0 - 200 || c.y > this.vy1 + 200) continue;
      this._headlights(g, c);
    }

    // police cruisers in pursuit cast a chasing spotlight
    if (game.police.wanted >= 2) {
      for (const c of game.police.cruisers) {
        if (c.wrecked || !c.siren) continue;
        if (c.x < this.vx0 - 200 || c.x > this.vx1 + 200 || c.y < this.vy0 - 200 || c.y > this.vy1 + 200) continue;
        const a = c.angle;
        const ox = c.x + Math.cos(a) * c.spec.len * 0.5;
        const oy = c.y + Math.sin(a) * c.spec.len * 0.5;
        const gr = g.createRadialGradient(ox, oy, 4, ox, oy, 120);
        gr.addColorStop(0, 'rgba(255,255,250,0.16)');
        gr.addColorStop(1, 'rgba(255,255,250,0)');
        g.fillStyle = gr;
        g.beginPath();
        g.moveTo(ox, oy);
        g.arc(ox, oy, 120, a - 0.24, a + 0.24);
        g.closePath();
        g.fill();
      }
    }

    // neon signs + reflections
    for (const b of this.world.buildings) {
      if (!b.neon) continue;
      if (b.x + b.w < this.vx0 - 60 || b.x > this.vx1 + 60 || b.y + b.h < this.vy0 - 60 || b.y > this.vy1 + 60) continue;
      this._neon(g, b, game);
    }

    // burning cars glow
    for (const c of cars) {
      if (c.burn > 0 && !c.wrecked) {
        const gr = g.createRadialGradient(c.x, c.y, 4, c.x, c.y, 90);
        gr.addColorStop(0, 'rgba(255,140,40,0.3)');
        gr.addColorStop(1, 'rgba(255,120,30,0)');
        g.fillStyle = gr;
        g.fillRect(c.x - 90, c.y - 90, 180, 180);
      }
    }

    g.restore();
  }

  _headlights(g, c) {
    const a = c.angle;
    const fx = Math.cos(a), fy = Math.sin(a);
    const px = -fy, py = fx;
    const hl = c.spec.len / 2;
    for (const side of [-1, 1]) {
      const ox = c.x + fx * hl + px * side * (c.spec.wid * 0.3);
      const oy = c.y + fy * hl + py * side * (c.spec.wid * 0.3);
      const reach = 150;
      const spread = 0.32;
      const gr = g.createRadialGradient(ox, oy, 6, ox, oy, reach);
      gr.addColorStop(0, 'rgba(255,236,180,0.20)');
      gr.addColorStop(1, 'rgba(255,236,180,0)');
      g.fillStyle = gr;
      g.beginPath();
      g.moveTo(ox, oy);
      g.arc(ox, oy, reach, a - spread, a + spread);
      g.closePath();
      g.fill();
    }
  }

  _neon(g, b, game) {
    const n = b.neon;
    const flicker = (game.time * 7 + b.x) % 10 < 9.4 ? 1 : 0.4; // occasional flicker
    g.save();
    const ox = -b.ht * 0.22, oy = -b.ht * 0.3;
    const sx = n.x + ox, sy = n.y + oy;
    g.font = 'bold 13px "Segoe UI", Arial, sans-serif';
    g.textAlign = 'center';
    g.shadowColor = n.color;
    g.shadowBlur = 14 * flicker;
    g.fillStyle = n.color;
    g.globalAlpha = 0.95 * flicker;
    g.fillText(n.text, sx, sy);
    g.fillText(n.text, sx, sy);
    g.restore();
    // wet sheen reflection on the street below the sign
    const road = this.world.nearestRoadPoint(n.x, n.y + 40);
    if (road && Math.abs(road.y - n.y) < 200) {
      const gr = g.createRadialGradient(n.x, road.y + 14, 2, n.x, road.y + 14, 70);
      gr.addColorStop(0, rgba(n.color, 0.10 * flicker));
      gr.addColorStop(1, rgba(n.color, 0));
      g.save();
      g.globalCompositeOperation = 'lighter';
      g.fillStyle = gr;
      g.fillRect(n.x - 70, road.y - 40, 140, 110);
      g.restore();
    }
  }

  // -------------------------------------------------------------- particles
  drawParticles(game) {
    const g = this.ctx;
    for (const p of game.fx.particles) {
      if (p.x < this.vx0 || p.x > this.vx1 || p.y < this.vy0 || p.y > this.vy1) continue;
      const t = p.life / p.maxLife;
      if (p.kind === 'smoke') {
        g.fillStyle = rgba(p.color, 0.30 * t);
        g.beginPath(); g.arc(p.x, p.y, p.size * (1.6 - t * 0.6), 0, 7); g.fill();
      } else if (p.kind === 'fire') {
        g.save();
        g.globalCompositeOperation = 'lighter';
        g.fillStyle = rgba(p.color, 0.7 * t);
        g.beginPath(); g.arc(p.x, p.y, p.size * t, 0, 7); g.fill();
        g.restore();
      } else if (p.kind === 'spark') {
        g.save();
        g.globalCompositeOperation = 'lighter';
        g.strokeStyle = rgba(p.color, t);
        g.lineWidth = 1.6;
        g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(p.x - p.vx * 0.03, p.y - p.vy * 0.03); g.stroke();
        g.restore();
      } else if (p.kind === 'ripple') {
        g.strokeStyle = rgba(p.color, 0.4 * t);
        g.lineWidth = 1.5;
        g.beginPath();
        g.ellipse(p.x, p.y, p.size * (1.8 - t), p.size * (1.8 - t) * 0.6, 0, 0, 7);
        g.stroke();
      } else if (p.kind === 'debris') {
        g.save();
        g.translate(p.x, p.y);
        g.rotate(p.rot || 0);
        g.fillStyle = rgba(p.color, 0.9 * t);
        g.fillRect(-p.size, -p.size / 2, p.size * 2, p.size);
        g.restore();
      } else if (p.kind === 'blood') {
        g.fillStyle = rgba(p.color, 0.8 * t);
        g.fillRect(p.x - 1.5, p.y - 1.5, 3, 3);
      }
    }
    // bullet tracers
    for (const tr of game.fx.tracers) {
      g.save();
      g.globalCompositeOperation = 'lighter';
      g.strokeStyle = rgba('#ffe89a', tr.life * 2);
      g.lineWidth = 1.6;
      g.beginPath();
      g.moveTo(tr.x0, tr.y0);
      g.lineTo(tr.x1, tr.y1);
      g.stroke();
      g.restore();
    }
  }

  drawWorldTexts(game) {
    // floating damage/pickup texts live in fx.texts
    const g = this.ctx;
    g.font = 'bold 12px "Segoe UI", Arial, sans-serif';
    g.textAlign = 'center';
    for (const t of game.fx.texts) {
      g.fillStyle = rgba(t.color, Math.min(1, t.life * 2));
      g.fillText(t.text, t.x, t.y);
    }
  }

  /** landing-light rain streaks on the camera lens during storms */
  drawLensRain(g, game) {
    if (!game.weather || game.weather.intensity < 2) return;
    g.save();
    g.strokeStyle = 'rgba(210,225,245,0.16)';
    g.lineWidth = 1.4;
    for (let i = 0; i < 9; i++) {
      const seed = i * 137 + Math.floor(this.time * 2.2) * 89;
      const x = (seed % 1280) + Math.sin(seed) * 30;
      const y = ((seed * 7) % 720);
      const len = 24 + (seed % 30);
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + 6, y + len);
      g.stroke();
    }
    g.restore();
  }

  // ------------------------------------------------------------------ post
  drawFlashAndVignette(game) {
    const g = this.ctx;
    // lighthouse beam sweeping from the north pier (pure mood)
    if (this.world.piers.length) {
      const pier = this.world.piers[0];
      const bx = pier.x + pier.w / 2, by = pier.y;
      const sweep = this.time * 0.5;
      g.save();
      g.globalCompositeOperation = 'lighter';
      const beam = g.createLinearGradient(bx, by, bx + Math.cos(sweep) * 700, by + Math.sin(sweep) * 700);
      beam.addColorStop(0, 'rgba(255,246,200,0.10)');
      beam.addColorStop(1, 'rgba(255,246,200,0)');
      g.fillStyle = beam;
      g.beginPath();
      g.moveTo(bx, by);
      g.arc(bx, by, 700, sweep - 0.045, sweep + 0.045);
      g.closePath();
      g.fill();
      g.restore();
    }
    if (game.fx.flash > 0.01) {
      g.save();
      g.globalCompositeOperation = 'lighter';
      g.fillStyle = `rgba(255,240,210,${Math.min(0.85, game.fx.flash)})`;
      g.fillRect(0, 0, VIEW.w, VIEW.h);
      g.restore();
    }
    this.drawLensRain(g, game);
    // night tint + vignette
    const gr = g.createRadialGradient(VIEW.w / 2, VIEW.h / 2, VIEW.h * 0.42, VIEW.w / 2, VIEW.h / 2, VIEW.h * 0.86);
    gr.addColorStop(0, 'rgba(8,10,18,0)');
    gr.addColorStop(1, 'rgba(8,10,18,0.55)');
    g.fillStyle = gr;
    g.fillRect(0, 0, VIEW.w, VIEW.h);
    if (game.player.hurtT > 0) {
      g.fillStyle = `rgba(180,20,30,${game.player.hurtT * 0.5})`;
      g.fillRect(0, 0, VIEW.w, VIEW.h);
    }
  }

  // --------------------------------------------------------------- minimap
  drawMinimap(game) {
    const g = this.ctx;
    const cx = 132, cy = VIEW.h - 128, R = 108;
    const mm = this.world.minimap;
    if (!mm) return;
    g.save();
    g.beginPath(); g.arc(cx, cy, R, 0, 7); g.clip();
    g.fillStyle = '#0c1016';
    g.fillRect(cx - R, cy - R, R * 2, R * 2);
    const k = this.world.minimapScale * 2.2;   // minimap zoom
    const px = game.player.x * this.world.minimapScale;
    const py = game.player.y * this.world.minimapScale;
    g.imageSmoothingEnabled = false;
    g.drawImage(mm, cx - px * 2.2, cy - py * 2.2, mm.width * 2.2, mm.height * 2.2);
    // blips
    const w2m = (wx, wy) => ({ x: cx + (wx - game.player.x) * k, y: cy + (wy - game.player.y) * k });
    for (const m of game.missions.markers()) {
      const q = w2m(m.x, m.y);
      g.fillStyle = m.kind === 'story' ? '#3fd9ff' : m.kind === 'side' ? '#8bff5e' : m.kind === 'checkpoint' ? '#ffd23e' : '#ff4d9d';
      g.fillRect(q.x - 3, q.y - 3, 6, 6);
    }
    if (game.police.wanted > 0) {
      for (const c of game.police.cruisers) {
        if (c.wrecked) continue;
        const q = w2m(c.x, c.y);
        g.fillStyle = '#4d6bff';
        g.fillRect(q.x - 2.5, q.y - 2.5, 5, 5);
      }
      for (const c of game.police.cops) {
        const q = w2m(c.x, c.y);
        g.fillStyle = '#4d9bff';
        g.fillRect(q.x - 2, q.y - 2, 4, 4);
      }
    }
    // player arrow
    g.save();
    g.translate(cx, cy);
    g.rotate(game.player.angle + Math.PI / 2);
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.moveTo(0, -7); g.lineTo(5, 6); g.lineTo(-5, 6);
    g.closePath();
    g.fill();
    g.restore();
    g.restore();
    // ring
    g.save();
    g.strokeStyle = 'rgba(220,230,255,0.55)';
    g.lineWidth = 3;
    g.beginPath(); g.arc(cx, cy, R + 1, 0, 7); g.stroke();
    if (game.police.wanted > 0 && Math.floor(game.time * 2) % 2 === 0) {
      g.strokeStyle = 'rgba(80,110,255,0.9)';
      g.beginPath(); g.arc(cx, cy, R + 4, 0, 7); g.stroke();
    }
    g.restore();
  }
}

function HRW() { return CFG.ROAD_W / 2; }
