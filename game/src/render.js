// render.js — the whole picture: ground, roads, wet sheen, 2.5D buildings
// with neon trim, entities, particles, explosion flashes, additive light
// pass (headlights, lamps, sirens, signs), night tint, vignette, minimap,
// and the camera.

import { CFG, roadX, roadY, NEON, COLORS } from './config.js';
import { G, clamp, lerp, hash2, RNG } from './util.js';
import { mouse } from './input.js';
import { drawCar } from './cars.js';
import { drawPed } from './peds.js';
import { drawCop } from './police.js';

export class Renderer {
  constructor(canvas) {
    this.cv = canvas;
    this.c = canvas.getContext('2d');
    this.sheen = [];
    const rng = new RNG(4242);
    // wet-asphalt sheen patches along roads
    for (let k = 0; k < 160; k++) {
      const vert = rng.chance(0.5);
      const road = vert ? rng.int(0, CFG.COLS) : rng.int(0, CFG.ROWS);
      const along = rng.range(0, vert ? CFG.H : CFG.W);
      const off = rng.range(-CFG.RW / 3, CFG.RW / 3);
      const len = rng.range(60, 190);
      if (vert) this.sheen.push({ x: roadX(road) + off, y: along, w: rng.range(4, 9), h: len });
      else this.sheen.push({ x: along, y: roadY(road) + off, w: len, h: rng.range(4, 9) });
    }
  }

  // ------------------------------------------------------------- camera
  updateCamera(dt) {
    const cam = G.cam;
    const P = G.player;
    if (!P) return;
    let tx = P.x, ty = P.y, tz = CFG.ZOOM_FOOT;
    if (P.car) {
      const sp = P.car.speed;
      tx = P.x + P.car.vx * 0.42;
      ty = P.y + P.car.vy * 0.42;
      tz = lerp(CFG.ZOOM_CAR, CFG.ZOOM_FAST, clamp(sp / 380, 0, 1));
    }
    const k = 1 - Math.exp(-5 * dt);
    cam.x = lerp(cam.x, tx, k);
    cam.y = lerp(cam.y, ty, k);
    cam.z = lerp(cam.z, tz, 1 - Math.exp(-2.5 * dt));
    cam.shake = Math.max(0, cam.shake - dt * 26);
    cam.flash = Math.max(0, (cam.flash || 0) - dt * 2.2);
  }

  frame() {
    const c = this.c;
    const cam = G.cam;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.fillStyle = '#06040f';
    c.fillRect(0, 0, G.w, G.h);

    const shx = (Math.random() - 0.5) * cam.shake;
    const shy = (Math.random() - 0.5) * cam.shake;
    const z = cam.z;
    c.save();
    c.translate(G.w / 2 + shx, G.h / 2 + shy);
    c.scale(z, z);
    c.translate(-cam.x, -cam.y);

    // view rect for culling
    this.vx0 = cam.x - G.w / 2 / z - 60;
    this.vy0 = cam.y - G.h / 2 / z - 60;
    this.vx1 = cam.x + G.w / 2 / z + 60;
    this.vy1 = cam.y + G.h / 2 / z + 60;

    this.drawGround(c);
    this.drawRoads(c);
    this.drawPiers(c);
    this.drawSkids(c);
    this.drawStreetProps(c);
    this.drawMarkers(c);
    this.drawPickups(c);
    this.drawPeds(c);
    this.drawCops(c);
    this.drawCars(c);
    this.drawPlayer(c);
    this.drawBuildings(c);
    this.drawHeli(c);
    this.drawParticles(c);
    this.drawBooms(c);
    this.drawLights(c);
    if (G.weather) G.weather.drawBolt(c);

    c.restore();

    // full-screen passes
    c.fillStyle = CFG.NIGHT;
    c.fillRect(0, 0, G.w, G.h);
    if (G.cam.flash > 0) {
      c.fillStyle = `rgba(255,240,210,${clamp(G.cam.flash * 0.55, 0, 0.55)})`;
      c.fillRect(0, 0, G.w, G.h);
    }
    this.drawVignette(c);
    if (G.weather) G.weather.drawRain(c);
  }

  vis(x, y, w, h) {
    return x + w > this.vx0 && x < this.vx1 && y + h > this.vy0 && y < this.vy1;
  }

  // ------------------------------------------------------------- ground
  drawGround(c) {
    const w = G.world;
    // land base
    c.fillStyle = '#191a26';
    c.fillRect(this.vx0, this.vy0, this.vx1 - this.vx0, this.vy1 - this.vy0);

    // ocean (south)
    if (this.vy1 > CFG.BEACH_Y) {
      c.fillStyle = COLORS.sand;
      c.fillRect(this.vx0, CFG.BEACH_Y, this.vx1 - this.vx0, CFG.WATER_Y - CFG.BEACH_Y);
      c.fillStyle = COLORS.water;
      c.fillRect(this.vx0, CFG.WATER_Y, this.vx1 - this.vx0, this.vy1 - CFG.WATER_Y);
      // waves
      c.strokeStyle = 'rgba(90,160,220,0.16)';
      c.lineWidth = 2;
      const t = G.t;
      c.beginPath();
      for (let k = 0; k < 6; k++) {
        const wy = CFG.WATER_Y + 30 + k * 42 + Math.sin(t * 1.4 + k) * 7;
        c.moveTo(this.vx0, wy);
        c.lineTo(this.vx1, wy);
      }
      c.stroke();
      // surf line
      c.fillStyle = 'rgba(220,240,255,0.22)';
      c.fillRect(this.vx0, CFG.WATER_Y - 4 + Math.sin(t * 2) * 3, this.vx1 - this.vx0, 6);
    }

    // harbor basin
    for (const wr of w.waterRects) {
      if (!this.vis(wr.x, wr.y, wr.w, wr.h)) continue;
      c.fillStyle = COLORS.water;
      c.fillRect(wr.x, wr.y, wr.w, wr.h);
      c.strokeStyle = 'rgba(90,160,220,0.14)';
      c.lineWidth = 2;
      c.beginPath();
      for (let k = 0; k < 4; k++) {
        const wy = wr.y + 40 + k * 60 + Math.sin(G.t * 1.2 + k * 2) * 6;
        c.moveTo(wr.x, wy);
        c.lineTo(wr.x + wr.w, wy);
      }
      c.stroke();
    }

    this.drawBlockSkins(c, w);

    // pond
    if (w.pondRect && this.vis(w.pondRect.x, w.pondRect.y, w.pondRect.w, w.pondRect.h)) {
      const p = w.pondRect;
      c.fillStyle = COLORS.water;
      c.fillRect(p.x, p.y, p.w, p.h);
      c.strokeStyle = 'rgba(90,160,220,0.2)';
      c.strokeRect(p.x + 3, p.y + 3, p.w - 6, p.h - 6);
    }

    // park paths + palms + lamps
    for (const d of w.decors) {
      if (d.kind === 'path' && this.vis(d.x, d.y, d.w, d.h)) {
        c.fillStyle = COLORS.path;
        c.fillRect(d.x, d.y, d.w, d.h);
      }
    }
    for (const ci of w.circles) {
      if (!this.vis(ci.x - 12, ci.y - 12, 24, 24)) continue;
      if (ci.kind === 'palm') {
        c.fillStyle = 'rgba(0,0,0,0.4)';
        c.beginPath(); c.ellipse(ci.x + 3, ci.y + 4, 9, 5, 0, 0, Math.PI * 2); c.fill();
        c.fillStyle = '#5a4028';
        c.fillRect(ci.x - 2, ci.y - 2, 4, 5);
        // fronds
        const sway = Math.sin(G.t * 1.6 + ci.x) * 0.08;
        c.strokeStyle = '#2f7a44';
        c.lineWidth = 3.4;
        for (let a = 0; a < 6; a++) {
          const ang = (a / 6) * Math.PI * 2 + sway;
          c.beginPath();
          c.moveTo(ci.x, ci.y - 2);
          c.quadraticCurveTo(
            ci.x + Math.cos(ang) * 8, ci.y - 2 + Math.sin(ang) * 8 - 3,
            ci.x + Math.cos(ang) * 13, ci.y - 2 + Math.sin(ang) * 13
          );
          c.stroke();
        }
      } else {
        // lamp pole
        c.fillStyle = '#33343e';
        c.fillRect(ci.x - 1.5, ci.y - 1.5, 3, 3);
      }
    }

    // runways
    for (const rw of w.runways) {
      if (!this.vis(rw.x, rw.y, rw.w, rw.h)) continue;
      c.fillStyle = COLORS.runway;
      c.fillRect(rw.x, rw.y, rw.w, rw.h);
      c.strokeStyle = 'rgba(230,230,220,0.5)';
      c.lineWidth = 3;
      c.setLineDash([26, 22]);
      c.beginPath();
      c.moveTo(rw.x + 8, rw.y + rw.h / 2);
      c.lineTo(rw.x + rw.w - 8, rw.y + rw.h / 2);
      c.stroke();
      c.setLineDash([]);
    }
  }

  // block-level district skins (sidewalk rings + lot fills)
  drawBlockSkins(c, w) {
    const inner = CFG.B - CFG.RW;
    for (let by = 0; by < CFG.ROWS; by++) {
      for (let bx = 0; bx < CFG.COLS; bx++) {
        const x = roadX(bx) + CFG.RW / 2;
        const y = roadY(by) + CFG.RW / 2;
        if (!this.vis(x, y, inner, inner)) continue;
        const d = w.districtOf(bx, by);
        // sidewalk slab
        c.fillStyle = '#23242e';
        c.fillRect(x, y, inner, inner);
        // kerb line
        c.strokeStyle = 'rgba(0,0,0,0.5)';
        c.lineWidth = 2;
        c.strokeRect(x + 1, y + 1, inner - 2, inner - 2);
        // lot fill
        let lot = '#15161f';
        if (d === 'park') lot = COLORS.grass;
        else if (d === 'beach') lot = COLORS.sand;
        else if (d === 'docks') lot = '#1d1e26';
        else if (d === 'airfield') lot = '#1a1b22';
        else if (d === 'downtown') lot = '#131420';
        c.fillRect(x + CFG.SW, y + CFG.SW, inner - CFG.SW * 2, inner - CFG.SW * 2);
        if (d === 'park') {
          c.fillStyle = COLORS.grassDark;
          for (let k = 0; k < 5; k++) {
            const gx = hash2(bx * 31 + k, by * 17 + k) * (inner - 40) + CFG.SW;
            const gy = hash2(by * 13 + k, bx * 7 + k) * (inner - 40) + CFG.SW;
            c.fillRect(x + gx, y + gy, 22, 12);
          }
        }
        // parking-lot paint
        for (const lotR of w.parkingLots) {
          if (lotR.bx !== bx || lotR.by !== by) continue;
          c.fillStyle = '#191b26';
          c.fillRect(lotR.x, lotR.y, lotR.w, lotR.h);
          c.strokeStyle = 'rgba(207,202,188,0.35)';
          c.lineWidth = 2;
          c.beginPath();
          for (let k = 0; k < 4; k++) {
            const px = lotR.x + 12 + k * (lotR.w - 24) / 3;
            c.moveTo(px, lotR.y + 10);
            c.lineTo(px, lotR.y + 46);
            c.moveTo(px, lotR.y + lotR.h - 46);
            c.lineTo(px, lotR.y + lotR.h - 10);
          }
          c.stroke();
        }
      }
    }
  }

  // ------------------------------------------------------------- roads
  drawRoads(c) {
    const rw = CFG.RW;
    c.fillStyle = COLORS.asphaltWet;
    for (let i = 0; i <= CFG.COLS; i++) {
      const x = roadX(i) - rw / 2;
      if (x + rw < this.vx0 || x > this.vx1) continue;
      c.fillRect(x, this.vy0, rw, this.vy1 - this.vy0);
    }
    for (let j = 0; j <= CFG.ROWS; j++) {
      const y = roadY(j) - rw / 2;
      if (y + rw < this.vy0 || y > this.vy1) continue;
      c.fillRect(this.vx0, y, this.vx1 - this.vx0, rw);
    }
    // wet sheen
    c.fillStyle = 'rgba(120,150,210,0.05)';
    for (const s of this.sheen) {
      if (this.vis(s.x, s.y, s.w, s.h)) c.fillRect(s.x, s.y, s.w, s.h);
    }
    // lane dashes
    c.strokeStyle = 'rgba(190,184,120,0.55)';
    c.lineWidth = 2;
    c.setLineDash([18, 26]);
    c.beginPath();
    for (let i = 0; i <= CFG.COLS; i++) {
      const x = roadX(i);
      if (x < this.vx0 || x > this.vx1) continue;
      c.moveTo(x, Math.max(0, this.vy0));
      c.lineTo(x, Math.min(CFG.H, this.vy1));
    }
    for (let j = 0; j <= CFG.ROWS; j++) {
      const y = roadY(j);
      if (y < this.vy0 || y > this.vy1) continue;
      c.moveTo(Math.max(0, this.vx0), y);
      c.lineTo(Math.min(CFG.W, this.vx1), y);
    }
    c.stroke();
    c.setLineDash([]);

    // crosswalks + stop lines at intersections
    for (let i = 0; i <= CFG.COLS; i++) {
      for (let j = 0; j <= CFG.ROWS; j++) {
        const x = roadX(i), y = roadY(j);
        if (!this.vis(x - rw, y - rw, rw * 2, rw * 2)) continue;
        c.fillStyle = 'rgba(207,202,188,0.4)';
        for (let k = -3; k <= 3; k++) {
          c.fillRect(x + k * 11 - 3, y - rw / 2 + 3, 6, 9);
          c.fillRect(x + k * 11 - 3, y + rw / 2 - 12, 6, 9);
          c.fillRect(x - rw / 2 + 3, y + k * 11 - 3, 9, 6);
          c.fillRect(x + rw / 2 - 12, y + k * 11 - 3, 9, 6);
        }
      }
    }

    // marine-layer wetness: the whole grid drinks the light
    if (G.weather) {
      G.weather.drawWetSheen(c, { x0: this.vx0, y0: this.vy0, x1: this.vx1, y1: this.vy1 });
    }
  }

  drawPiers(c) {
    for (const p of G.world.piers) {
      if (!this.vis(p.x, p.y, p.w, p.h)) continue;
      c.fillStyle = COLORS.plank;
      c.fillRect(p.x, p.y, p.w, p.h);
      c.strokeStyle = 'rgba(0,0,0,0.35)';
      c.lineWidth = 1;
      c.beginPath();
      if (p.w < p.h) {
        for (let y = p.y; y < p.y + p.h; y += 14) { c.moveTo(p.x, y); c.lineTo(p.x + p.w, y); }
      } else {
        for (let x = p.x; x < p.x + p.w; x += 14) { c.moveTo(x, p.y); c.lineTo(x, p.y + p.h); }
      }
      c.stroke();
    }
  }

  drawSkids(c) {
    c.strokeStyle = 'rgba(12,10,10,0.5)';
    c.lineWidth = 3;
    c.beginPath();
    for (const s of G.skids) {
      if (s.x < this.vx0 || s.x > this.vx1 || s.y < this.vy0 || s.y > this.vy1) continue;
      c.moveTo(s.x - Math.sin(s.a) * 4, s.y + Math.cos(s.a) * 4);
      c.lineTo(s.x + Math.sin(s.a) * 4, s.y - Math.cos(s.a) * 4);
    }
    c.stroke();
  }

  // ------------------------------------------------------------- buildings
  drawBuildings(c) {
    const w = G.world;
    for (const b of w.bldgs) {
      if (!this.vis(b.x - 40, b.y - 40, b.w + 80, b.h + b.ht + 40)) continue;
      const ox = -b.ht * 0.22, oy = -b.ht * 0.22;
      // walls: four quads from base rect to roof rect
      const x0 = b.x, y0 = b.y, x1 = b.x + b.w, y1 = b.y + b.h;
      const rx0 = x0 + ox, ry0 = y0 + oy, rx1 = x1 + ox, ry1 = y1 + oy;
      c.fillStyle = shadeFill(b.c, 0.5);
      quad(c, x0, y1, x1, y1, rx1, ry1, rx0, ry1);   // south face
      c.fillStyle = shadeFill(b.c, 0.38);
      quad(c, x1, y0, x1, y1, rx1, ry1, rx1, ry0);   // east face
      c.fillStyle = shadeFill(b.c, 0.44);
      quad(c, x0, y0, x1, y0, rx1, ry0, rx0, ry0);   // north face
      quad(c, x0, y0, x0, y1, rx0, ry1, rx0, ry0);   // west face
      // roof
      c.fillStyle = shadeFill(b.c, 0.85);
      c.fillRect(rx0, ry0, b.w, b.h);
      // roof details: vents / skylights
      const seed = (b.x * 7 + b.y * 13) | 0;
      c.fillStyle = 'rgba(0,0,0,0.28)';
      for (let k = 0; k < 3; k++) {
        const hx = rx0 + 8 + hash2(seed + k, 7) * Math.max(1, b.w - 24);
        const hy = ry0 + 8 + hash2(seed + k, 19) * Math.max(1, b.h - 24);
        c.fillRect(hx, hy, 10, 7);
      }
      // window lights on the south wall
      if (b.ht > 20) {
        const rows = clamp(Math.floor(b.ht / 16), 1, 7);
        for (let rI = 0; rI < rows; rI++) {
          for (let k = 0; k < Math.floor(b.w / 18); k++) {
            const lit = hash2(seed + k * 3, rI * 7 + b.ht) > 0.62;
            if (!lit) continue;
            const wx = x0 + 6 + k * 18;
            const wy = y1 - (rI + 1) * (b.ht / rows) * 0.28 + 2;
            c.fillStyle = 'rgba(255,214,140,0.75)';
            c.fillRect(wx, wy, 7, 4);
          }
        }
      }
      // neon trim on roofs
      if (b.neon) {
        c.strokeStyle = hexA(b.neon, 0.16);
        c.lineWidth = 7;
        c.strokeRect(rx0, ry0, b.w, b.h);
        c.strokeStyle = b.neon;
        c.lineWidth = 2;
        c.strokeRect(rx0, ry0, b.w, b.h);
      }
    }
    // neon signs (shop text)
    for (const d of G.world.decors) {
      if (d.kind !== 'sign' || !this.vis(d.x - 60, d.y - 40, 120, 80)) continue;
      c.font = 'bold 13px "Arial Black", sans-serif';
      c.textAlign = 'center';
      c.fillStyle = hexA(d.c, 0.9);
      c.fillText(d.t, d.x + 30, d.y + 12);
      c.textAlign = 'left';
    }
    // rooftop billboards
    for (const bb of G.world.billboards) {
      if (!this.vis(bb.x - bb.w, bb.y - 30, bb.w * 2, 60)) continue;
      c.fillStyle = '#0d0e16';
      c.fillRect(bb.x - bb.w / 2, bb.y - 12, bb.w, 24);
      c.strokeStyle = hexA(bb.c, 0.85);
      c.lineWidth = 2;
      c.strokeRect(bb.x - bb.w / 2, bb.y - 12, bb.w, 24);
      c.fillStyle = hexA(bb.c, 0.95);
      c.font = 'bold 13px "Arial Black", sans-serif';
      c.textAlign = 'center';
      c.fillText(bb.text, bb.x, bb.y + 4);
      c.textAlign = 'left';
    }
    // cranes + planes
    for (const d of G.world.decors) {
      if (d.kind === 'crane' && this.vis(d.x - 90, d.y - 120, 180, 160)) {
        c.fillStyle = '#c9a13a';
        c.fillRect(d.x - 3, d.y - 96, 6, 96);
        c.fillRect(d.x - 3, d.y - 96, 150, 6);
        c.fillRect(d.x - 60, d.y - 96, 60, 5);
        c.strokeStyle = '#8a7326';
        c.lineWidth = 1.5;
        c.beginPath(); c.moveTo(d.x + 90, d.y - 90); c.lineTo(d.x + 90, d.y - 60); c.stroke();
        c.fillStyle = '#3a3d4a';
        c.fillRect(d.x + 84, d.y - 60, 12, 10);
      }
      if (d.kind === 'plane' && this.vis(d.x - 60, d.y - 60, 140, 120)) {
        c.fillStyle = '#b8bcc8';
        c.fillRect(d.x, d.y + 6, 84, 12);
        c.beginPath(); c.moveTo(d.x + 84, d.y + 2); c.lineTo(d.x + 100, d.y + 12); c.lineTo(d.x + 84, d.y + 22); c.fill();
        c.fillRect(d.x + 30, d.y - 10, 8, 44);
        c.fillStyle = '#ff5040';
        c.fillRect(d.x + 2, d.y + 4, 6, 6);
      }
    }
    // the ship at the pier
    this.drawShip(c);
  }

  drawShip(c) {
    const wr = G.world.waterRects[0];
    if (!wr || !this.vis(wr.x, wr.y, wr.w, wr.h)) return;
    const sx = wr.x + 120, sy = wr.y + 30, sw = 420, sh = 150;
    // hull
    c.fillStyle = '#20242e';
    c.beginPath();
    c.moveTo(sx, sy);
    c.lineTo(sx + sw - 50, sy);
    c.quadraticCurveTo(sx + sw + 30, sy + sh / 2, sx + sw - 50, sy + sh);
    c.lineTo(sx, sy + sh);
    c.closePath();
    c.fill();
    c.strokeStyle = '#0d0f14';
    c.lineWidth = 3;
    c.stroke();
    // containers on deck
    const cols = ['#8a3a2e', '#2e6f8a', '#8a7a2e', '#3a6f46'];
    for (let k = 0; k < 8; k++) {
      c.fillStyle = cols[k % cols.length];
      c.fillRect(sx + 24 + (k % 4) * 74, sy + 22 + Math.floor(k / 4) * 52, 60, 38);
    }
    // superstructure
    c.fillStyle = '#39404e';
    c.fillRect(sx + sw - 160, sy + sh / 2 - 26, 70, 52);
    c.fillStyle = 'rgba(255,214,140,0.85)';
    c.fillRect(sx + sw - 150, sy + sh / 2 - 16, 50, 10);
    c.fillStyle = '#ff5040';
    c.fillRect(sx + sw - 130, sy + sh / 2 - 42, 6, 12);
  }

  // ------------------------------------------------------------- entities
  drawPeds(c) {
    for (const p of G.peds) {
      if (p.x < this.vx0 || p.x > this.vx1 || p.y < this.vy0 || p.y > this.vy1) continue;
      drawPed(c, p);
    }
  }

  drawCops(c) {
    for (const cop of G.cops) {
      if (cop.x < this.vx0 || cop.x > this.vx1 || cop.y < this.vy0 || cop.y > this.vy1) continue;
      drawCop(c, cop);
    }
  }

  drawCars(c) {
    for (const car of G.cars) {
      if (car.x < this.vx0 - 60 || car.x > this.vx1 + 60 || car.y < this.vy0 - 60 || car.y > this.vy1 + 60) continue;
      drawCar(c, car);
    }
  }

  drawPlayer(c) {
    const P = G.player;
    if (!P || P.car) return;
    c.save();
    c.translate(P.x, P.y);
    c.rotate(P.h);
    c.fillStyle = 'rgba(0,0,0,0.4)';
    c.beginPath(); c.ellipse(1, 3, 8, 6, 0, 0, Math.PI * 2); c.fill();
    // legs
    const step = Math.sin(P.walkT * 12) * 3.6;
    c.fillStyle = '#e8e6e3';
    c.fillRect(-2, -4 + step * 0.4, 6, 3.4);
    c.fillRect(-2, 1 - step * 0.4, 6, 3.4);
    // jacket
    c.fillStyle = '#f2eee2';
    c.beginPath(); c.ellipse(0, 0, 6.4, 5, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#ff5c8f';               // vice-stripe
    c.fillRect(-1.5, -5, 2.4, 10);
    // arms + gun
    c.fillStyle = '#d9a06b';
    c.fillRect(3, -5.4, 4, 2.6);
    c.fillRect(3, 2.8, 4, 2.6);
    c.fillStyle = '#111';
    c.fillRect(7, -3.4, 7, 2.6);
    // head
    c.beginPath(); c.arc(1.5, 0, 3.6, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#20160e';
    c.beginPath(); c.arc(0.2, 0, 3, Math.PI * 0.35, Math.PI * 1.65); c.fill();
    c.restore();
    // hurt flash
    if (P.hurtT > 0) {
      c.strokeStyle = `rgba(255,60,60,${P.hurtT * 2})`;
      c.lineWidth = 2;
      c.beginPath(); c.arc(P.x, P.y, 12, 0, Math.PI * 2); c.stroke();
    }
    // respawn shield
    if (P.shield > 0) {
      const blink = Math.floor(P.shield * 8) % 2 === 0;
      if (blink) {
        c.strokeStyle = 'rgba(0,229,255,0.7)';
        c.lineWidth = 2;
        c.beginPath(); c.arc(P.x, P.y, 15 + Math.sin(G.t * 6) * 2, 0, Math.PI * 2); c.stroke();
      }
    }
    // aim line while armed on foot
    if (!P.car && G.state === 'playing') {
      const mx = mouse.x, my = mouse.y;
      c.strokeStyle = 'rgba(255,47,125,0.22)';
      c.lineWidth = 1;
      c.beginPath();
      c.moveTo(P.x + Math.cos(P.h) * 14, P.y + Math.sin(P.h) * 14);
      c.lineTo(mx, my);
      c.stroke();
    }
  }

  // ------------------------------------------------------------- street props
  drawStreetProps(c) {
    const w = G.world;
    // bus stop shelters
    for (const st of w.busStops) {
      if (!this.vis(st.x - 20, st.y - 20, st.w + 40, st.h + 40)) continue;
      c.fillStyle = '#2c3242';
      c.fillRect(st.x, st.y, st.w, st.h);
      c.fillStyle = 'rgba(140,190,230,0.28)';
      c.fillRect(st.x + 3, st.y + 2, st.w - 6, st.h - 4);
      c.strokeStyle = 'rgba(255,210,74,0.5)';
      c.lineWidth = 1.5;
      c.strokeRect(st.x + 0.5, st.y + 0.5, st.w - 1, st.h - 1);
    }
    // fuel station canopy + pump islands
    for (const d of w.decors) {
      if (d.kind !== 'gas' || !this.vis(d.x - 90, d.y - 70, 180, 140)) continue;
      c.fillStyle = 'rgba(38,44,52,0.85)';
      c.fillRect(d.x - 62, d.y - 34, 124, 68);
      c.strokeStyle = '#ffb200';
      c.lineWidth = 2.5;
      c.strokeRect(d.x - 62, d.y - 34, 124, 68);
      c.fillStyle = '#ffb200';
      c.font = 'bold 12px sans-serif';
      c.textAlign = 'center';
      c.fillText('GAS', d.x, d.y + 4);
      c.textAlign = 'left';
      c.fillStyle = '#c93a2a';
      c.fillRect(d.x - 40, d.y - 12, 14, 20);
      c.fillRect(d.x + 26, d.y - 12, 14, 20);
    }
    // park fountain
    const f = w.fountain;
    if (f && this.vis(f.x - 40, f.y - 40, 80, 80)) {
      c.fillStyle = '#2c2e3c';
      c.beginPath(); c.arc(f.x, f.y, 30, 0, Math.PI * 2); c.fill();
      c.fillStyle = COLORS.water;
      c.beginPath(); c.arc(f.x, f.y, 24, 0, Math.PI * 2); c.fill();
      c.strokeStyle = 'rgba(140,190,230,0.4)';
      c.lineWidth = 2;
      for (let k = 0; k < 5; k++) {
        const a = G.t * 2 + (k / 5) * Math.PI * 2;
        c.beginPath();
        c.moveTo(f.x + Math.cos(a) * 4, f.y + Math.sin(a) * 4);
        c.lineTo(f.x + Math.cos(a) * 14, f.y + Math.sin(a) * 14);
        c.stroke();
      }
      c.fillStyle = '#8f95a6';
      c.beginPath(); c.arc(f.x, f.y, 6, 0, Math.PI * 2); c.fill();
    }
    // spike strips
    for (const s of G.spikes) {
      if (!this.vis(s.x, s.y, s.w, s.h)) continue;
      c.fillStyle = '#1a1c24';
      c.fillRect(s.x, s.y, s.w, s.h);
      c.fillStyle = '#c9cbd4';
      for (let k = 0; k < 6; k++) {
        const sx = s.x + 5 + k * (s.w - 10) / 5;
        c.beginPath();
        c.moveTo(sx - 3, s.y + s.h);
        c.lineTo(sx, s.y + 1);
        c.lineTo(sx + 3, s.y + s.h);
        c.closePath();
        c.fill();
      }
    }
    // road lamps
    for (const l of w.roadLamps) {
      if (!this.vis(l.x - 10, l.y - 10, 20, 20)) continue;
      c.fillStyle = '#33343e';
      c.fillRect(l.x - 2, l.y - 2, 4, 4);
    }
    // hydrants
    for (const h of w.hydrants) {
      if (!this.vis(h.x - 8, h.y - 8, 16, 16)) continue;
      c.fillStyle = '#c93a2a';
      c.fillRect(h.x - 2.5, h.y - 2.5, 5, 5);
      c.fillStyle = 'rgba(255,255,255,0.35)';
      c.fillRect(h.x - 2.5, h.y - 0.5, 5, 1.5);
    }
    // trash bins (they are solids — show them)
    for (const b of w.bins) {
      if (!this.vis(b.x - 8, b.y - 8, b.w + 16, b.h + 16)) continue;
      c.fillStyle = 'rgba(0,0,0,0.4)';
      c.fillRect(b.x + 2, b.y + 2, b.w, b.h);
      c.fillStyle = '#3d5240';
      c.fillRect(b.x, b.y, b.w, b.h);
      c.fillStyle = '#2a3a2e';
      c.fillRect(b.x, b.y, b.w, 3);
    }
    // moored boats
    for (const b of w.boats) {
      if (!this.vis(b.x - 60, b.y - 40, 120, 80)) continue;
      const bob = Math.sin(G.t * 1.3 + b.bob) * 2;
      c.save();
      c.translate(b.x, b.y + bob);
      c.fillStyle = 'rgba(0,0,0,0.3)';
      c.beginPath(); c.ellipse(2, 5, b.len / 2, 10, 0, 0, Math.PI * 2); c.fill();
      c.fillStyle = b.hue;
      c.beginPath();
      c.moveTo(-b.len / 2, -8);
      c.lineTo(b.len / 2 - 10, -8);
      c.lineTo(b.len / 2, 0);
      c.lineTo(b.len / 2 - 10, 8);
      c.lineTo(-b.len / 2, 8);
      c.closePath();
      c.fill();
      c.fillStyle = '#20242e';
      c.fillRect(-b.len / 2 + 8, -5, 14, 10);
      c.restore();
    }
    // beach leftovers: folded umbrellas + volleyball nets
    for (const p of w.beachProps) {
      if (!this.vis(p.x - 40, p.y - 40, 80, 80)) continue;
      if (p.kind === 'umbrella') {
        c.strokeStyle = p.hue;
        c.lineWidth = 2;
        c.beginPath(); c.moveTo(p.x, p.y); c.lineTo(p.x + 8, p.y - 12); c.stroke();
        c.fillStyle = p.hue;
        c.beginPath(); c.ellipse(p.x + 9, p.y - 13, 9, 4, -0.4, 0, Math.PI * 2); c.fill();
      } else {
        c.strokeStyle = 'rgba(232,230,227,0.5)';
        c.lineWidth = 1.5;
        c.beginPath();
        c.moveTo(p.x, p.y - 10); c.lineTo(p.x, p.y + 10);
        c.moveTo(p.x + 26, p.y - 10); c.lineTo(p.x + 26, p.y + 10);
        c.moveTo(p.x, p.y - 10); c.lineTo(p.x + 26, p.y - 10);
        c.moveTo(p.x, p.y); c.lineTo(p.x + 26, p.y);
        c.moveTo(p.x, p.y + 10); c.lineTo(p.x + 26, p.y + 10);
        c.stroke();
      }
    }
    // construction site: cones, barriers, wet slab
    for (const cn of w.cones) {
      if (!this.vis(cn.x - 10, cn.y - 10, 20, 20)) continue;
      c.fillStyle = '#ff8f2a';
      c.beginPath();
      c.moveTo(cn.x, cn.y - 8);
      c.lineTo(cn.x + 5, cn.y + 5);
      c.lineTo(cn.x - 5, cn.y + 5);
      c.closePath();
      c.fill();
      c.fillStyle = 'rgba(255,255,255,0.7)';
      c.fillRect(cn.x - 3, cn.y - 1, 6, 2);
    }
    for (const b of w.barriers) {
      if (!this.vis(b.x - 8, b.y - 8, b.w + 16, b.h + 16)) continue;
      c.fillStyle = '#e05a2a';
      c.fillRect(b.x, b.y, b.w, b.h);
      c.fillStyle = 'rgba(255,255,255,0.75)';
      c.fillRect(b.x, b.y + b.h / 2 - 1.5, b.w, 3);
    }
    for (const d of w.decors) {
      if (d.kind !== 'slab' || !this.vis(d.x, d.y, d.w, d.h)) continue;
      c.fillStyle = '#3c3e4a';
      c.fillRect(d.x, d.y, d.w, d.h);
      c.strokeStyle = 'rgba(207,202,188,0.25)';
      c.strokeRect(d.x + 6, d.y + 6, d.w - 12, d.h - 12);
    }
  }

  // ------------------------------------------------------------- pickups
  drawPickups(c) {
    const S = G.shops;
    if (!S) return;
    for (const p of S.pickups) {
      if (p.taken || !this.vis(p.x - 20, p.y - 20, 40, 40)) continue;
      const bob = Math.sin(p.bob) * 3;
      const col = p.kind === 'health' ? '#ff5c8f'
        : p.kind === 'armor' ? '#4c7dff'
        : p.kind === 'ammo' ? '#ffd24a' : '#7cffa0';
      c.save();
      c.translate(p.x, p.y + bob);
      c.globalCompositeOperation = 'lighter';
      const g = c.createRadialGradient(0, 0, 2, 0, 0, 20);
      g.addColorStop(0, col.replace(')', ',0.35)').replace('rgb', 'rgba').replace('#', '#'));
      g.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = hexA(col, 0.22);
      c.beginPath(); c.arc(0, 0, 18, 0, Math.PI * 2); c.fill();
      c.restore();
      c.save();
      c.translate(p.x, p.y + bob);
      c.rotate(p.bob * 0.9);
      c.fillStyle = col;
      c.fillRect(-6, -6, 12, 12);
      c.fillStyle = 'rgba(0,0,0,0.5)';
      c.font = 'bold 9px sans-serif';
      c.textAlign = 'center';
      const glyph = p.kind === 'health' ? '+' : p.kind === 'armor' ? 'A' : p.kind === 'ammo' ? '\u2261' : '$';
      c.rotate(-p.bob * 0.9);
      c.fillText(glyph, 0, 3.5);
      c.textAlign = 'left';
      c.restore();
    }
  }

  // ------------------------------------------------------------- helicopter
  drawHeli(c) {
    const H = G.helis;
    if (!H) return;
    for (const h of H.list) {
      if (h.gone) continue;
      const body = h.bodyPos();
      // ground shadow
      if (this.vis(h.x - 60, h.y - 40, 120, 80)) {
        c.fillStyle = `rgba(0,0,0,${clamp(0.34 - h.alt * 0.0004, 0.08, 0.3)})`;
        c.beginPath(); c.ellipse(h.x, h.y, 44, 16, 0, 0, Math.PI * 2); c.fill();
      }
      // searchlight cone down to the ground target
      if (!h.dead && !h.leave) {
        c.save();
        c.globalCompositeOperation = 'lighter';
        const g = c.createRadialGradient(h.spot.x, h.spot.y, 6, h.spot.x, h.spot.y, 110);
        g.addColorStop(0, 'rgba(230,240,255,0.30)');
        g.addColorStop(1, 'rgba(230,240,255,0)');
        c.fillStyle = g;
        c.beginPath(); c.arc(h.spot.x, h.spot.y, 110, 0, Math.PI * 2); c.fill();
        c.restore();
      }
      if (!this.vis(body.x - 80, body.y - 80, 160, 160)) continue;
      c.save();
      c.translate(body.x, body.y);
      // rotor blur disc
      c.fillStyle = 'rgba(180,190,210,0.16)';
      c.beginPath(); c.arc(0, -4, 46, 0, Math.PI * 2); c.fill();
      c.strokeStyle = 'rgba(180,190,210,0.4)';
      c.lineWidth = 2;
      c.beginPath();
      const ra = h.rotorT % (Math.PI * 2);
      c.moveTo(Math.cos(ra) * 46, -4 + Math.sin(ra) * 46);
      c.lineTo(-Math.cos(ra) * 46, -4 - Math.sin(ra) * 46);
      c.stroke();
      // fuselage
      c.fillStyle = h.dead ? '#241f1c' : '#20293c';
      rrect2(c, -26, -9, 52, 18, 8);
      c.fill();
      c.fillStyle = '#10131c';
      c.fillRect(14, -5, 16, 10);         // tail boom
      c.fillRect(26, -9, 5, 12);          // tail fin
      c.fillStyle = 'rgba(130,180,220,0.6)';
      c.beginPath(); c.arc(-10, 0, 7, 0, Math.PI * 2); c.fill();
      if (!h.dead) {
        const fl = Math.floor(h.rotorT) % 2 === 0;
        c.fillStyle = fl ? '#ff3040' : '#3a0a12';
        c.fillRect(-2, -11, 5, 4);
        c.fillStyle = fl ? '#0a1440' : '#2a3cff';
        c.fillRect(-2, 7, 5, 4);
        c.fillStyle = 'rgba(255,255,255,0.85)';
        c.font = 'bold 6px sans-serif';
        c.textAlign = 'center';
        c.fillText('VCPD', 2, 3);
        c.textAlign = 'left';
      }
      c.restore();
      if (h.dead) {
        // fire trail while falling
        G.parts.push({ x: body.x, y: body.y, vx: 0, vy: 0, life: 0.4, max: 0.4, type: 'fire', r: 8 });
      }
    }
  }

  // ------------------------------------------------------------- particles
  drawParticles(c) {
    for (const p of G.parts) {
      if (p.x < this.vx0 || p.x > this.vx1 || p.y < this.vy0 || p.y > this.vy1) continue;
      const a = clamp(p.life / p.max, 0, 1);
      if (p.type === 'smoke') {
        c.fillStyle = `rgba(70,70,80,${a * 0.4})`;
        c.beginPath(); c.arc(p.x, p.y, p.r * (2 - a), 0, Math.PI * 2); c.fill();
      } else if (p.type === 'fire') {
        c.fillStyle = `rgba(255,${140 + a * 80},40,${a * 0.85})`;
        c.beginPath(); c.arc(p.x, p.y, p.r * a + 2, 0, Math.PI * 2); c.fill();
      } else if (p.type === 'blood') {
        c.fillStyle = `rgba(160,20,30,${a})`;
        c.beginPath(); c.arc(p.x, p.y, p.r, 0, Math.PI * 2); c.fill();
      } else if (p.type === 'muzzle') {
        c.fillStyle = `rgba(255,230,150,${a})`;
        c.beginPath(); c.arc(p.x, p.y, p.r, 0, Math.PI * 2); c.fill();
      } else if (p.type === 'spark') {
        c.fillStyle = `rgba(255,210,120,${a})`;
        c.fillRect(p.x - 1.5, p.y - 1.5, 3, 3);
      } else if (p.type === 'ripple') {
        c.strokeStyle = `rgba(170,210,240,${a * 0.5})`;
        c.lineWidth = 1.5;
        c.beginPath(); c.arc(p.x, p.y, p.r * (2 - a), 0, Math.PI * 2); c.stroke();
      }
    }
  }

  drawBooms(c) {
    for (const b of G.booms) {
      b.t += 1 / 60;
      const k = clamp(b.t / 0.55, 0, 1);
      if (k >= 1) continue;
      const r = b.r * (0.3 + k * 0.9);
      const g = c.createRadialGradient(b.x, b.y, 0, b.x, b.y, r);
      g.addColorStop(0, `rgba(255,255,230,${(1 - k) * 0.95})`);
      g.addColorStop(0.4, `rgba(255,170,60,${(1 - k) * 0.8})`);
      g.addColorStop(1, 'rgba(120,40,10,0)');
      c.fillStyle = g;
      c.beginPath(); c.arc(b.x, b.y, r, 0, Math.PI * 2); c.fill();
      if (b.t < 0.12) G.cam.flash = Math.max(G.cam.flash || 0, 0.6);
    }
    // sweep finished booms
    for (let i = G.booms.length - 1; i >= 0; i--) {
      if (G.booms[i].t > 0.6) G.booms.splice(i, 1);
    }
  }

  // ------------------------------------------------------------- light pass
  drawLights(c) {
    c.save();
    c.globalCompositeOperation = 'lighter';
    // street lamps
    for (const ci of G.world.circles) {
      if (ci.kind !== 'lamp') continue;
      if (!this.vis(ci.x - 70, ci.y - 70, 140, 140)) continue;
      const g = c.createRadialGradient(ci.x, ci.y, 4, ci.x, ci.y, 74);
      g.addColorStop(0, 'rgba(255,200,120,0.16)');
      g.addColorStop(1, 'rgba(255,200,120,0)');
      c.fillStyle = g;
      c.beginPath(); c.arc(ci.x, ci.y, 74, 0, Math.PI * 2); c.fill();
    }
    // main-road lamps
    for (const l of G.world.roadLamps) {
      if (!this.vis(l.x - 70, l.y - 70, 140, 140)) continue;
      const g = c.createRadialGradient(l.x, l.y, 4, l.x, l.y, 84);
      g.addColorStop(0, 'rgba(190,220,255,0.13)');
      g.addColorStop(1, 'rgba(190,220,255,0)');
      c.fillStyle = g;
      c.beginPath(); c.arc(l.x, l.y, 84, 0, Math.PI * 2); c.fill();
    }
    // headlights + sirens
    for (const car of G.cars) {
      if (car.dead) continue;
      if (car.x < this.vx0 - 160 || car.x > this.vx1 + 160 || car.y < this.vy0 - 160 || car.y > this.vy1 + 160) continue;
      if (car.driver || car.type === 'police') {
        const fx = Math.cos(car.h), fy = Math.sin(car.h);
        const px = -fy, py = fx;
        const len = 190;
        for (const side of [-1, 1]) {
          const hx = car.x + fx * car.hw - px * side * (car.hh - 5);
          const hy = car.y + fy * car.hw - py * side * (car.hh - 5);
          const g = c.createRadialGradient(hx + fx * 60, hy + fy * 60, 6, hx + fx * 60, hy + fy * 60, 110);
          g.addColorStop(0, 'rgba(255,236,170,0.20)');
          g.addColorStop(1, 'rgba(255,236,170,0)');
          c.fillStyle = g;
          c.beginPath();
          c.moveTo(hx, hy);
          c.lineTo(hx + fx * len - px * 58, hy + fy * len - py * 58);
          c.lineTo(hx + fx * len + px * 58, hy + fy * len + py * 58);
          c.closePath();
          c.fill();
        }
      }
      if (car.type === 'police' && (car.driver === 'police' || car.ai)) {
        const fl = Math.floor(car.sirenFlash * 5) % 2 === 0;
        const g = c.createRadialGradient(car.x, car.y, 4, car.x, car.y, 90);
        g.addColorStop(0, fl ? 'rgba(255,40,60,0.24)' : 'rgba(60,80,255,0.24)');
        g.addColorStop(1, 'rgba(0,0,0,0)');
        c.fillStyle = g;
        c.beginPath(); c.arc(car.x, car.y, 90, 0, Math.PI * 2); c.fill();
      }
      // tail glow when braking
      if (car.driver && car.ctrl.throttle < 0) {
        const fx = Math.cos(car.h), fy = Math.sin(car.h);
        const g = c.createRadialGradient(car.x - fx * car.hw, car.y - fy * car.hw, 2, car.x - fx * car.hw, car.y - fy * car.hw, 40);
        g.addColorStop(0, 'rgba(255,60,40,0.20)');
        g.addColorStop(1, 'rgba(255,60,40,0)');
        c.fillStyle = g;
        c.beginPath(); c.arc(car.x - fx * car.hw, car.y - fy * car.hw, 40, 0, Math.PI * 2); c.fill();
      }
    }
    // neon signs glow
    for (const d of G.world.decors) {
      if (d.kind !== 'sign' || !this.vis(d.x - 80, d.y - 60, 160, 120)) continue;
      const g = c.createRadialGradient(d.x + 30, d.y + 8, 4, d.x + 30, d.y + 8, 70);
      g.addColorStop(0, hexA(d.c, 0.18));
      g.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = g;
      c.beginPath(); c.arc(d.x + 30, d.y + 8, 70, 0, Math.PI * 2); c.fill();
    }
    c.restore();
  }

  // ------------------------------------------------------------- markers
  drawMarkers(c) {
    const ms = G.missions ? G.missions.markers : [];
    for (const m of ms) {
      if (!this.vis(m.x - m.r - 20, m.y - m.r - 20, m.r * 2 + 40, m.r * 2 + 40)) continue;
      const pulse = 0.5 + 0.5 * Math.sin(G.t * 4 + m.x);
      c.save();
      c.globalCompositeOperation = 'lighter';
      const g = c.createRadialGradient(m.x, m.y, 2, m.x, m.y, m.r * 1.6);
      g.addColorStop(0, hexA(m.color, 0.35 + pulse * 0.2));
      g.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = g;
      c.beginPath(); c.arc(m.x, m.y, m.r * 1.6, 0, Math.PI * 2); c.fill();
      c.restore();
      c.strokeStyle = hexA(m.color, 0.9);
      c.lineWidth = 3;
      c.beginPath(); c.arc(m.x, m.y, m.r * (0.9 + pulse * 0.12), 0, Math.PI * 2); c.stroke();
      if (m.giver) {
        c.fillStyle = hexA(m.color, 0.9);
        c.font = 'bold 12px sans-serif';
        c.textAlign = 'center';
        c.fillText(m.label || 'JOB', m.x, m.y - m.r - 8);
        c.textAlign = 'left';
      }
    }
    // shop service rings
    if (G.shops) {
      for (const m of G.shops.markers()) {
        if (!this.vis(m.x - m.r - 16, m.y - m.r - 16, m.r * 2 + 32, m.r * 2 + 32)) continue;
        c.strokeStyle = hexA(m.color, 0.55 + 0.2 * Math.sin(G.t * 3 + m.x));
        c.lineWidth = 2.5;
        c.setLineDash([8, 7]);
        c.beginPath(); c.arc(m.x, m.y, m.r, 0, Math.PI * 2); c.stroke();
        c.setLineDash([]);
        c.fillStyle = hexA(m.color, 0.8);
        c.font = 'bold 10px sans-serif';
        c.textAlign = 'center';
        c.fillText(m.shop === 'ammu' ? 'GUNS' : m.shop === 'spray' ? 'SPRAY' : 'FOOD', m.x, m.y - m.r - 6);
        c.textAlign = 'left';
      }
    }
  }

  // ------------------------------------------------------------- vignette
  drawVignette(c) {
    const g = c.createRadialGradient(G.w / 2, G.h / 2, G.h * 0.42, G.w / 2, G.h / 2, G.h * 0.82);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(2,0,10,0.5)');
    c.fillStyle = g;
    c.fillRect(0, 0, G.w, G.h);
  }
}

// ---------------------------------------------------------------- helpers
function shadeFill(hexOrRgb, k) {
  if (hexOrRgb.startsWith('#')) {
    const n = parseInt(hexOrRgb.slice(1), 16);
    const r = Math.round(((n >> 16) & 255) * k);
    const g = Math.round(((n >> 8) & 255) * k);
    const b = Math.round((n & 255) * k);
    return `rgb(${r},${g},${b})`;
  }
  return hexOrRgb;
}

function hexA(hex, a) {
  if (!hex) return 'rgba(255,255,255,' + a + ')';
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

function quad(c, x0, y0, x1, y1, x2, y2, x3, y3) {
  c.beginPath();
  c.moveTo(x0, y0);
  c.lineTo(x1, y1);
  c.lineTo(x2, y2);
  c.lineTo(x3, y3);
  c.closePath();
  c.fill();
}

function rrect2(c, x, y, w, h, r) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}
