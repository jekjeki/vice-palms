// Vice Palms — renderer: faux-3D night city, neon glow, wet sheen, minimap.

import { VIEW_W, VIEW_H, WORLD, ROADS, ROAD_W, SIDEWALK, COLORS, LANE } from './config.js';
import { lightFor } from './world.js';
import { STATIONS } from './train.js';
import { rrPath, clamp, lerp, damp, shade, rgba, shadowText } from './util.js';

const HALF = ROAD_W / 2;
const MM = 512;               // minimap texture size
const MMS = MM / WORLD;       // minimap scale

export class Render {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.mmBase = null;
    this.t = 0;
  }

  // ------------------------------------------------------------- camera

  updateCam(game, dt) {
    const cam = game.cam;
    const p = game.player;
    let tx = p.x, ty = p.y;
    if (p.inCar) {
      tx += clamp(p.inCar.vx * 0.45, -170, 170);
      ty += clamp(p.inCar.vy * 0.45, -170, 170);
    }
    if (game.screens.mode === 'title') {
      // slow cinematic drift over downtown
      const a = game.time * 0.05;
      tx = ROADS[7] + Math.cos(a) * 420;
      ty = ROADS[7] + Math.sin(a * 1.3) * 420;
    }
    const k = damp(game.screens.mode === 'title' ? 0.8 : 5.2, dt);
    cam.x = lerp(cam.x, tx, k);
    cam.y = lerp(cam.y, ty, k);
    cam.x = clamp(cam.x, VIEW_W / 2 - 200, WORLD - VIEW_W / 2 + 200);
    cam.y = clamp(cam.y, VIEW_H / 2 - 200, WORLD - VIEW_H / 2 + 200);
    cam.shake = Math.max(0, cam.shake - cam.shake * 5.5 * dt - 2 * dt);
    cam.flash = Math.max(0, cam.flash - 2.3 * dt);
  }

  viewRect(cam) {
    return {
      x: cam.x - VIEW_W / 2 - 120,
      y: cam.y - VIEW_H / 2 - 120,
      w: VIEW_W + 240,
      h: VIEW_H + 240,
    };
  }

  // ------------------------------------------------------------- frame

  draw(game, dt) {
    const ctx = this.ctx;
    this.t = game.time;
    this.updateCam(game, dt);
    const cam = game.cam;
    const shx = (Math.random() - 0.5) * cam.shake * 2;
    const shy = (Math.random() - 0.5) * cam.shake * 2;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = COLORS.sky;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);

    ctx.save();
    ctx.translate(Math.round(VIEW_W / 2 - cam.x + shx), Math.round(VIEW_H / 2 - cam.y + shy));

    this.drawGround(game);
    this.drawAirfield(game);
    this.drawDocks(game);
    this.drawBlocks(game);
    this.drawMarkers(game);
    this.drawPickups(game);
    this.drawPeds(game);
    this.drawCars(game);
    this.drawPlayer(game);
    this.drawParticles(game, false);
    this.drawBullets(game);
    this.drawSheen(game);
    this.drawGlow(game);
    this.drawParticles(game, true);
    this.drawTrain(game);
    this.drawHeli(game);

    ctx.restore();

    // rain (screen-space streaks)
    const w = game.weather;
    if (w && w.drops.length > 0) {
      ctx.strokeStyle = 'rgba(160,190,235,' + (0.14 + w.intensity * 0.22).toFixed(3) + ')';
      ctx.lineWidth = 1;
      ctx.beginPath();
      const wind = w.wind;
      for (const d of w.drops) {
        ctx.moveTo(d.x, d.y);
        ctx.lineTo(d.x - wind * 0.03, d.y - 13);
      }
      ctx.stroke();
      if (w.thunder > 0) {
        ctx.fillStyle = 'rgba(200,215,255,' + (w.thunder * 0.35).toFixed(3) + ')';
        ctx.fillRect(0, 0, VIEW_W, VIEW_H);
      }
    }

    // screen-space overlays
    if (cam.flash > 0) {
      ctx.fillStyle = 'rgba(255,244,220,' + (cam.flash * 0.55).toFixed(3) + ')';
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    }
    const vg = ctx.createRadialGradient(VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.42, VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.86);
    vg.addColorStop(0, 'rgba(4,6,16,0)');
    vg.addColorStop(1, 'rgba(4,6,16,0.5)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.fillStyle = 'rgba(18,26,64,0.07)';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);

    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }

  // ------------------------------------------------------------- ground

  drawGround(game) {
    const ctx = this.ctx;
    const cam = game.cam;
    const v = this.viewRect(cam);

    // asphalt base
    ctx.fillStyle = COLORS.asphalt;
    ctx.fillRect(v.x, v.y, v.w, v.h);

    // water + shore (west strip)
    if (v.x < 156) {
      const wX = Math.max(v.x, -100);
      ctx.fillStyle = COLORS.water;
      ctx.fillRect(wX, v.y, 130 - wX, v.h);
      // waves
      ctx.strokeStyle = rgba('#12405e', 0.5);
      ctx.lineWidth = 3;
      const t = this.t;
      for (let y = Math.floor(v.y / 34) * 34; y < v.y + v.h; y += 34) {
        const off = Math.sin(t * 1.2 + y * 0.05) * 14;
        ctx.beginPath();
        ctx.moveTo(wX + 10, y + off);
        ctx.quadraticCurveTo(wX + 60, y + off + 6, Math.min(128, v.x + v.w), y + off);
        ctx.stroke();
      }
      // foam line
      ctx.fillStyle = rgba('#bfe8ff', 0.22);
      ctx.fillRect(126, v.y, 5, v.h);
    }

    // blocks: sidewalk frame + district interior
    const i0 = Math.max(0, Math.floor((v.x - 400) / 400));
    const i1 = Math.min(14, Math.ceil((v.x + v.w) / 400));
    const j0 = Math.max(0, Math.floor((v.y - 400) / 400));
    const j1 = Math.min(14, Math.ceil((v.y + v.h) / 400));
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const b = game.world.blocks[j * 15 + i];
        if (!b) continue;
        // sidewalk
        ctx.fillStyle = COLORS.sidewalk;
        ctx.fillRect(b.x, b.y, b.w, b.h);
        // interior ground per district
        const ix = b.x + SIDEWALK, iy = b.y + SIDEWALK, iw = b.w - SIDEWALK * 2, ih = b.h - SIDEWALK * 2;
        let col = COLORS.lot;
        if (b.district === 'beach') col = COLORS.sand;
        else if (b.district === 'park') col = COLORS.grass;
        else if (b.district === 'docks') col = COLORS.dirt;
        ctx.fillStyle = col;
        ctx.fillRect(ix, iy, iw, ih);
        if (b.district === 'beach') {
          // sand speckle
          ctx.fillStyle = 'rgba(0,0,0,0.08)';
          for (let k = 0; k < 6; k++) {
            const sx = ix + ((i * 97 + j * 57 + k * 131) % Math.max(1, iw));
            const sy = iy + ((i * 31 + j * 173 + k * 89) % Math.max(1, ih));
            ctx.fillRect(sx, sy, 3, 3);
          }
        }
        if (b.district === 'park') {
          // paths
          ctx.fillStyle = '#3a3226';
          ctx.fillRect(ix, iy + ih / 2 - 5, iw, 10);
          ctx.fillRect(ix + iw / 2 - 5, iy, 10, ih);
        }
      }
    }

    // piers (wood over water)
    for (const p of game.world.piers) {
      if (p.x > v.x + v.w || p.x + p.w < v.x || p.y > v.y + v.h || p.y + p.h < v.y) continue;
      ctx.fillStyle = '#4a3b26';
      ctx.fillRect(p.x, p.y, p.w, p.h);
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      for (let x = p.x; x < p.x + p.w; x += 12) ctx.fillRect(x, p.y, 2, p.h);
    }

    // road markings
    ctx.fillStyle = rgba('#8a8f9c', 0.55);
    for (const ry of ROADS) {
      if (ry < v.y - HALF || ry > v.y + v.h + HALF) continue;
      for (let x = Math.floor(Math.max(80, v.x) / 64) * 64; x < Math.min(WORLD - 80, v.x + v.w); x += 64) {
        // skip dashes inside intersections
        let inCross = false;
        for (const rx of ROADS) if (Math.abs(x + 15 - rx) < HALF + 12) inCross = true;
        if (!inCross) ctx.fillRect(x, ry - 2, 30, 4);
      }
    }
    for (const rx of ROADS) {
      if (rx < v.x - HALF || rx > v.x + v.w + HALF) continue;
      for (let y = Math.floor(Math.max(80, v.y) / 64) * 64; y < Math.min(WORLD - 80, v.y + v.h); y += 64) {
        let inCross = false;
        for (const ry of ROADS) if (Math.abs(y + 15 - ry) < HALF + 12) inCross = true;
        if (!inCross) ctx.fillRect(rx - 2, y, 4, 30);
      }
    }
    // crosswalks
    ctx.fillStyle = rgba('#c9ccd6', 0.4);
    for (const cy of ROADS) {
      if (cy < v.y - 200 || cy > v.y + v.h + 200) continue;
      for (const cx of ROADS) {
        if (cx < v.x - 200 || cx > v.x + v.w + 200) continue;
        for (let k = -3; k <= 3; k++) {
          ctx.fillRect(cx + k * 12 - 3, cy - HALF - 16, 6, 12);
          ctx.fillRect(cx + k * 12 - 3, cy + HALF + 4, 6, 12);
          ctx.fillRect(cx - HALF - 16, cy + k * 12 - 3, 12, 6);
          ctx.fillRect(cx + HALF + 4, cy + k * 12 - 3, 12, 6);
        }
      }
    }

    // traffic light poles (base)
    for (const c of game.world.crossings) {
      if (c.x < v.x || c.x > v.x + v.w || c.y < v.y || c.y > v.y + v.h) continue;
      ctx.fillStyle = '#10131a';
      ctx.fillRect(c.x + HALF + 4, c.y + HALF + 4, 3, 12);
    }

    // street lamps (pole)
    for (const l of game.world.lamps) {
      if (l.x < v.x || l.x > v.x + v.w || l.y < v.y || l.y > v.y + v.h) continue;
      ctx.fillStyle = '#10131a';
      ctx.fillRect(l.x, l.y, 3, 3);
    }
  }

  // ------------------------------------------------------------- blocks

  drawBlocks(game) {
    const ctx = this.ctx;
    const cam = game.cam;
    const v = this.viewRect(cam);
    const i0 = Math.max(0, Math.floor((v.x - 400) / 400));
    const i1 = Math.min(14, Math.ceil((v.x + v.w) / 400));
    const j0 = Math.max(0, Math.floor((v.y - 400) / 400));
    const j1 = Math.min(14, Math.ceil((v.y + v.h) / 400));

    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const b = game.world.blocks[j * 15 + i];
        if (!b) continue;
        for (const bd of b.buildings) this.drawBuilding(ctx, cam, bd);
        // trees + palms
        for (const t of game.world.trees) {
          if (t.x < v.x || t.x > v.x + v.w || t.y < v.y || t.y > v.y + v.h) continue;
          ctx.fillStyle = 'rgba(0,0,0,0.3)';
          ctx.beginPath();
          ctx.ellipse(t.x + 4, t.y + 5, t.r * 0.9, t.r * 0.7, 0, 0, 7);
          ctx.fill();
          ctx.fillStyle = '#1d4a2c';
          ctx.beginPath();
          ctx.arc(t.x, t.y, t.r, 0, 7);
          ctx.fill();
          ctx.fillStyle = '#2a6a3d';
          ctx.beginPath();
          ctx.arc(t.x - t.r * 0.25, t.y - t.r * 0.25, t.r * 0.6, 0, 7);
          ctx.fill();
        }
      }
    }

    // palms are tall: parallax crown
    for (const p of game.world.palms) {
      if (p.x < v.x || p.x > v.x + v.w || p.y < v.y || p.y > v.y + v.h) continue;
      const dx = (p.x - cam.x) * 0.012, dy = (p.y - cam.y) * 0.012;
      ctx.strokeStyle = '#4a3b26';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x + dx, p.y + dy);
      ctx.stroke();
      ctx.fillStyle = '#2a6a3d';
      for (let k = 0; k < 5; k++) {
        const a = p.sway + (k / 5) * Math.PI * 2 + Math.sin(this.t * 1.6 + p.sway) * 0.06;
        ctx.beginPath();
        ctx.ellipse(p.x + dx + Math.cos(a) * p.r, p.y + dy + Math.sin(a) * p.r * 0.6, p.r * 0.8, p.r * 0.34, a, 0, 7);
        ctx.fill();
      }
    }

    // park fountain + stage
    const f = game.world.fountain;
    if (f && f.x > v.x && f.x < v.x + v.w && f.y > v.y && f.y < v.y + v.h) {
      ctx.fillStyle = '#2a2f3a';
      ctx.beginPath();
      ctx.arc(f.x, f.y, f.r + 6, 0, 7);
      ctx.fill();
      ctx.fillStyle = COLORS.waterLit;
      ctx.beginPath();
      ctx.arc(f.x, f.y, f.r - 2, 0, 7);
      ctx.fill();
      ctx.fillStyle = rgba('#bfe8ff', 0.5 + Math.sin(this.t * 3) * 0.2);
      ctx.beginPath();
      ctx.arc(f.x, f.y, 6 + Math.sin(this.t * 4) * 2, 0, 7);
      ctx.fill();
    }
    const st = game.world.stage;
    if (st && st.x < v.x + v.w && st.x + st.w > v.x && st.y < v.y + v.h && st.y + st.h > v.y) {
      ctx.fillStyle = '#4a3b26';
      ctx.fillRect(st.x, st.y, st.w, st.h);
      ctx.fillStyle = '#5f4c34';
      ctx.fillRect(st.x, st.y - 6, st.w, 10);
    }

    this.drawProps(game, v);
  }

  /** Street furniture: hydrants, benches, bins, bus stops. */
  drawProps(game, v) {
    const ctx = this.ctx;
    for (const p of game.world.props) {
      if (p.x < v.x || p.x > v.x + v.w || p.y < v.y || p.y > v.y + v.h) continue;
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath();
      ctx.ellipse(p.x + 2, p.y + 3, 7, 4, 0, 0, 7);
      ctx.fill();
      if (p.kind === 'hydrant') {
        ctx.fillStyle = '#a83232';
        ctx.fillRect(p.x - 3, p.y - 5, 6, 9);
        ctx.fillStyle = '#c94f4f';
        ctx.fillRect(p.x - 4, p.y - 6, 8, 3);
      } else if (p.kind === 'bench') {
        ctx.fillStyle = '#5f4c34';
        ctx.fillRect(p.x - 12, p.y - 4, 24, 8);
        ctx.fillStyle = '#4a3b26';
        ctx.fillRect(p.x - 12, p.y - 7, 24, 3);
      } else if (p.kind === 'bin') {
        ctx.fillStyle = '#3a4048';
        ctx.fillRect(p.x - 5, p.y - 6, 10, 11);
        ctx.fillStyle = '#4a525c';
        ctx.fillRect(p.x - 6, p.y - 7, 12, 3);
      } else {
        // bus stop shelter
        ctx.fillStyle = 'rgba(120,170,220,0.25)';
        ctx.fillRect(p.x - 16, p.y - 14, 32, 22);
        ctx.strokeStyle = '#4a525c';
        ctx.lineWidth = 2;
        ctx.strokeRect(p.x - 16, p.y - 14, 32, 22);
        ctx.fillStyle = '#ff9f2d';
        ctx.fillRect(p.x - 16, p.y - 18, 32, 5);
      }
    }
  }

  drawBuilding(ctx, cam, bd) {
    const cx = bd.x + bd.w / 2, cy = bd.y + bd.h / 2;
    // faux-3D parallax offset
    let dx = (cx - cam.x) * bd.ht * 0.0016;
    let dy = (cy - cam.y) * bd.ht * 0.0016;
    dx = clamp(dx, -bd.ht * 0.42, bd.ht * 0.42);
    dy = clamp(dy, -bd.ht * 0.42, bd.ht * 0.42);

    // footprint shadow
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.fillRect(bd.x + 5, bd.y + 6, bd.w, bd.h);

    // walls: connect footprint edges to the roof rect
    const roofX = bd.x + dx, roofY = bd.y + dy;
    ctx.fillStyle = shade(bd.col, 0.62);
    if (dy > 0) this.wallQuad(ctx, bd.x, bd.y + bd.h, bd.x + bd.w, bd.y + bd.h, roofX + bd.w, roofY + bd.h, roofX, roofY + bd.h);
    if (dy < 0) this.wallQuad(ctx, bd.x, bd.y, bd.x + bd.w, bd.y, roofX, roofY, roofX + bd.w, roofY);
    if (dx > 0) this.wallQuad(ctx, bd.x + bd.w, bd.y, bd.x + bd.w, bd.y + bd.h, roofX + bd.w, roofY + bd.h, roofX + bd.w, roofY);
    if (dx < 0) this.wallQuad(ctx, bd.x, bd.y, bd.x, bd.y + bd.h, roofX, roofY, roofX, roofY + bd.h);

    // lit windows on the visible walls
    if (bd.seedN !== undefined) {
      ctx.fillStyle = rgba('#ffd98a', 0.75);
      const step = 14;
      if (dy !== 0) {
        const wy = dy > 0 ? bd.y + bd.h : bd.y;
        for (let x = bd.x + 8, k = 0; x < bd.x + bd.w - 8; x += step, k++) {
          if ((bd.seedN + k * 7) % 5 < 2) ctx.fillRect(x + dx * 0.5, wy + dy * 0.5 + (dy > 0 ? 3 : -6), 5, 4);
        }
      }
      if (dx !== 0) {
        const wx = dx > 0 ? bd.x + bd.w : bd.x;
        for (let y = bd.y + 10, k = 0; y < bd.y + bd.h - 8; y += step, k++) {
          if ((bd.seedN + k * 13) % 5 < 2) ctx.fillRect(wx + dx * 0.5 + (dx > 0 ? 3 : -8), y + dy * 0.5, 4, 5);
        }
      }
    }

    // roof
    ctx.fillStyle = bd.roofCol || shade(bd.col, 1.2);
    ctx.fillRect(roofX, roofY, bd.w, bd.h);
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 1;
    ctx.strokeRect(roofX + 0.5, roofY + 0.5, bd.w - 1, bd.h - 1);

    // roof props (AC units / vents), deterministic
    const props = bd.props || 0;
    for (let k = 0; k < props; k++) {
      const s = (bd.seedN || 7) + k * 977;
      const px = roofX + 10 + (s % Math.max(1, bd.w - 26));
      const py = roofY + 10 + ((s >> 3) % Math.max(1, bd.h - 26));
      ctx.fillStyle = 'rgba(0,0,0,0.28)';
      ctx.fillRect(px, py, 9, 9);
      ctx.fillStyle = shade(bd.col, 1.35);
      ctx.fillRect(px - 1, py - 1, 8, 8);
    }

    // neon sign bar
    if (bd.neon) {
      const n = bd.neon;
      ctx.fillStyle = n.col;
      if (n.vertical) ctx.fillRect(roofX + bd.w * 0.5 - 5, roofY + 8, 10, Math.min(bd.h - 24, 90));
      else ctx.fillRect(roofX + 8, roofY + (cy < cam.y ? 8 : bd.h - 18), Math.min(bd.w - 24, 110), 10);
    }
  }

  wallQuad(ctx, x1, y1, x2, y2, x3, y3, x4, y4) {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.lineTo(x3, y3);
    ctx.lineTo(x4, y4);
    ctx.closePath();
    ctx.fill();
  }

  // ------------------------------------------------------------- docks / airfield

  drawDocks(game) {
    const ctx = this.ctx;
    const cam = game.cam;
    const v = this.viewRect(cam);

    // containers
    for (const c of game.world.containers) {
      if (c.x > v.x + v.w || c.x + c.w < v.x || c.y > v.y + v.h || c.y + c.h < v.y) continue;
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(c.x + 3, c.y + 4, c.w, c.h);
      ctx.fillStyle = c.col;
      ctx.fillRect(c.x, c.y, c.w, c.h);
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      for (let x = c.x + 6; x < c.x + c.w - 4; x += 9) ctx.fillRect(x, c.y + 2, 3, c.h - 4);
      ctx.strokeStyle = 'rgba(0,0,0,0.4)';
      ctx.strokeRect(c.x + 0.5, c.y + 0.5, c.w - 1, c.h - 1);
    }

    // the ship
    const s = game.world.ship;
    if (s && s.x < v.x + v.w && s.x + s.w > v.x && s.y < v.y + v.h && s.y + s.h > v.y) {
      ctx.fillStyle = '#20262e';
      ctx.fillRect(s.x, s.y, s.w, s.h);
      ctx.fillStyle = '#2c343f';
      ctx.fillRect(s.x + 8, s.y + 8, s.w - 16, s.h - 16);
      ctx.fillStyle = '#39424f';
      ctx.fillRect(s.x + s.w - 46, s.y + s.h / 2 - 18, 30, 36); // bridge
      ctx.fillStyle = '#ff2d78';
      ctx.fillRect(s.x + s.w - 40, s.y + s.h / 2 - 4, 4, 4);
      ctx.strokeStyle = rgba('#23e6ff', 0.8);
      ctx.lineWidth = 2;
      ctx.strokeRect(s.x + 2, s.y + 2, s.w - 4, s.h - 4);
    }

    // cranes
    for (const cr of game.world.cranes) {
      if (cr.x < v.x - 200 || cr.x > v.x + v.w + 200 || cr.y < v.y - 200 || cr.y > v.y + v.h + 200) continue;
      ctx.strokeStyle = '#c9a832';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(cr.x, cr.y);
      ctx.lineTo(cr.x, cr.y + cr.h);
      ctx.moveTo(cr.x + 26, cr.y);
      ctx.lineTo(cr.x + 26, cr.y + cr.h);
      ctx.moveTo(cr.x - 12, cr.y + 6);
      ctx.lineTo(cr.x + 38, cr.y + 6);
      ctx.moveTo(cr.x - 12, cr.y + cr.h - 6);
      ctx.lineTo(cr.x + 38, cr.y + cr.h - 6);
      ctx.stroke();
      ctx.strokeStyle = '#8a742a';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(cr.x + 13, cr.y + 6);
      ctx.lineTo(cr.x + 13, cr.y - cr.reach + 60);
      ctx.stroke();
      ctx.fillStyle = '#c9a832';
      ctx.fillRect(cr.x + 7, cr.y - cr.reach + 58, 12, 10);
    }
  }

  drawAirfield(game) {
    const ctx = this.ctx;
    const cam = game.cam;
    const v = this.viewRect(cam);
    const r = game.world.runway;
    if (!r) return;
    if (r.x > v.x + v.w || r.x + r.w < v.x || r.y > v.y + v.h || r.y + r.h < v.y) return;

    // runway surface
    ctx.fillStyle = '#14171d';
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.fillStyle = rgba('#c9ccd6', 0.6);
    for (let x = r.x + 20; x < r.x + r.w - 30; x += 90) ctx.fillRect(x, r.y + r.h / 2 - 2, 46, 4);
    // thresholds
    for (let k = 0; k < 6; k++) {
      ctx.fillRect(r.x + 8, r.y + 6 + k * 9, 26, 5);
      ctx.fillRect(r.x + r.w - 34, r.y + 6 + k * 9, 26, 5);
    }
    // hangars + tower
    for (const h of game.world.hangars) {
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(h.x + 4, h.y + 5, h.w, h.h);
      ctx.fillStyle = h.col;
      rrPath(ctx, h.x, h.y, h.w, h.h, 14);
      ctx.fill();
      ctx.fillStyle = shade(h.col, 1.25);
      rrPath(ctx, h.x + 8, h.y + 8, h.w - 16, h.h - 16, 10);
      ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.fillRect(h.x + 8, h.y + h.h - 18, h.w - 16, 8);
      if (h.ht > 40) {
        // air traffic control tower top
        ctx.fillStyle = '#46536e';
        ctx.beginPath();
        ctx.arc(h.x + h.w / 2, h.y + h.h / 2, 16, 0, 7);
        ctx.fill();
        ctx.fillStyle = rgba('#23e6ff', 0.8 + Math.sin(this.t * 4) * 0.2);
        ctx.beginPath();
        ctx.arc(h.x + h.w / 2, h.y + h.h / 2, 5, 0, 7);
        ctx.fill();
      }
    }
  }

  // ------------------------------------------------------------- actors

  drawMarkers(game) {
    const ctx = this.ctx;
    for (const m of game.markers) {
      const pulse = 0.65 + Math.sin(game.time * 4) * 0.3;
      ctx.fillStyle = rgba(m.col, 0.22 * pulse + 0.12);
      ctx.beginPath();
      ctx.arc(m.x, m.y, 26, 0, 7);
      ctx.fill();
      ctx.strokeStyle = rgba(m.col, 0.9);
      ctx.lineWidth = 2;
      ctx.stroke();
      shadowText(ctx, m.letter, m.x, m.y + 7, 22, m.col, 'center');
    }
  }

  drawPickups(game) {
    const ctx = this.ctx;
    for (const p of game.pickups) {
      const bob = Math.sin(game.time * 5 + p.x) * 2;
      const col = p.kind === 'cash' ? '#7dffa8' : p.kind === 'health' ? '#ff4d6d' : p.kind === 'armor' ? '#4db8ff' : '#ffd12d';
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath();
      ctx.ellipse(p.x, p.y + 6, 7, 3, 0, 0, 7);
      ctx.fill();
      ctx.fillStyle = col;
      if (p.kind === 'cash') {
        ctx.fillRect(p.x - 7, p.y - 4 + bob, 14, 8);
        ctx.fillStyle = 'rgba(0,0,0,0.4)';
        ctx.fillRect(p.x - 2, p.y - 4 + bob, 3, 8);
      } else if (p.kind === 'health') {
        ctx.fillRect(p.x - 7, p.y - 2 + bob, 14, 5);
        ctx.fillRect(p.x - 2, p.y - 7 + bob, 5, 14);
      } else if (p.kind === 'armor') {
        ctx.beginPath();
        ctx.moveTo(p.x, p.y - 8 + bob);
        ctx.lineTo(p.x + 7, p.y - 3 + bob);
        ctx.lineTo(p.x, p.y + 8 + bob);
        ctx.lineTo(p.x - 7, p.y - 3 + bob);
        ctx.closePath();
        ctx.fill();
      } else {
        ctx.fillRect(p.x - 2, p.y - 7 + bob, 5, 14);
        ctx.fillRect(p.x - 5, p.y - 5 + bob, 10, 4);
      }
    }
  }

  drawPeds(game) {
    const ctx = this.ctx;
    const v = this.viewRect(game.cam);
    for (const q of game.peds) {
      if (q.x < v.x || q.x > v.x + v.w || q.y < v.y || q.y > v.y + v.h) continue;
      this.drawPerson(ctx, q.x, q.y, q.h, q.skin, q.shirt, q.state === 'down', q.kind === 'cop', game, q);
    }
  }

  drawPlayer(game) {
    const ctx = this.ctx;
    const p = game.player;
    if (p.inCar) return;
    this.drawPerson(ctx, p.x, p.y, p.aim, '#d9b08c', '#e8e8ee', false, false, game, null, p.weapon === 1);
    // aim line
    ctx.strokeStyle = rgba('#ffffff', 0.25);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(p.x + Math.cos(p.aim) * 12, p.y + Math.sin(p.aim) * 12);
    ctx.lineTo(p.x + Math.cos(p.aim) * 46, p.y + Math.sin(p.aim) * 46);
    ctx.stroke();
  }

  drawPerson(ctx, x, y, h, skin, shirt, down, cop, game, q, armed) {
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(x + 2, y + 3, 8, 5, 0, 0, 7);
    ctx.fill();
    if (down) {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(h);
      ctx.fillStyle = shirt;
      ctx.beginPath();
      ctx.ellipse(0, 0, 10, 5, 0, 0, 7);
      ctx.fill();
      ctx.fillStyle = skin;
      ctx.beginPath();
      ctx.arc(9, 0, 4, 0, 7);
      ctx.fill();
      ctx.restore();
      return;
    }
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(h);
    // shoulders
    ctx.fillStyle = shirt;
    ctx.beginPath();
    ctx.ellipse(0, 0, 6, 8.5, 0, 0, 7);
    ctx.fill();
    // arms
    ctx.fillStyle = shade(shirt, 0.8);
    ctx.fillRect(2, -9, 5, 4);
    ctx.fillRect(2, 5, 5, 4);
    // gun
    if (armed || cop) {
      ctx.fillStyle = '#15151b';
      ctx.fillRect(7, -2, 9, 3);
    }
    // head
    ctx.fillStyle = skin;
    ctx.beginPath();
    ctx.arc(1.5, 0, 4.5, 0, 7);
    ctx.fill();
    if (cop) {
      ctx.fillStyle = '#1a2f5f';
      ctx.beginPath();
      ctx.arc(1.5, 0, 4.6, Math.PI * 0.6, Math.PI * 1.4);
      ctx.fill();
    }
    ctx.restore();
  }

  drawCars(game) {
    const ctx = this.ctx;
    const v = this.viewRect(game.cam);
    for (const c of game.cars) {
      if (c.x < v.x - 80 || c.x > v.x + v.w + 80 || c.y < v.y - 80 || c.y > v.y + v.h + 80) continue;
      this.drawCar(ctx, game, c);
    }
  }

  drawCar(ctx, game, c) {
    const spec = c.spec;
    const L = spec.l, W = spec.w;
    ctx.save();
    ctx.translate(c.x, c.y);

    // shadow
    ctx.save();
    ctx.rotate(c.h);
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    rrPath(ctx, -L / 2 + 3, -W / 2 + 4, L, W, 6);
    ctx.fill();
    ctx.restore();

    ctx.rotate(c.h);
    const hpF = c.hp / c.maxHp;

    if (c.dead) {
      // charred wreck
      ctx.fillStyle = '#1c1c20';
      rrPath(ctx, -L / 2, -W / 2, L, W, 6);
      ctx.fill();
      ctx.fillStyle = '#2a2a30';
      rrPath(ctx, -L / 2 + 4, -W / 2 + 3, L - 8, W - 6, 5);
      ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.beginPath();
      ctx.arc(L * 0.2, 0, W * 0.3, 0, 7);
      ctx.fill();
      ctx.restore();
      return;
    }

    // body
    let col = c.color;
    if (hpF < 0.55) col = shade(col, 0.72);
    ctx.fillStyle = col;
    rrPath(ctx, -L / 2, -W / 2, L, W, spec.kind === 'bus' ? 4 : 7);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.45)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // hood / trunk shading
    ctx.fillStyle = rgba('#ffffff', 0.07);
    ctx.fillRect(-L / 2 + 2, -W / 2 + 2, L - 4, 3);

    // wheels (visible on drift for style)
    ctx.fillStyle = '#0e0e12';
    const wx = L * 0.30, wy = W / 2 - 1;
    ctx.fillRect(wx - 5, -wy - 2, 9, 4);
    ctx.fillRect(wx - 5, wy - 2, 9, 4);
    ctx.fillRect(-wx - 5, -wy - 2, 9, 4);
    ctx.fillRect(-wx - 5, wy - 2, 9, 4);

    // cabin per body kind
    ctx.fillStyle = 'rgba(10,14,24,0.85)';
    if (spec.kind === 'truck') {
      ctx.fillRect(L * 0.12, -W / 2 + 3, L * 0.26, W - 6);
      ctx.fillStyle = rgba(c.color, 1);
      ctx.fillRect(-L / 2 + 3, -W / 2 + 2, L * 0.52, W - 4);
    } else if (spec.kind === 'bus') {
      ctx.fillStyle = 'rgba(20,26,40,0.9)';
      for (let x = -L / 2 + 12; x < L / 2 - 10; x += 14) ctx.fillRect(x, -W / 2 + 3, 9, W - 6);
    } else if (spec.kind === 'limo') {
      ctx.fillRect(-L * 0.1, -W / 2 + 3, L * 0.3, W - 6);
    } else {
      ctx.fillRect(-L * 0.16, -W / 2 + 3, L * 0.3, W - 6);
      // windshield
      ctx.fillStyle = 'rgba(120,170,220,0.5)';
      ctx.fillRect(L * 0.14, -W / 2 + 4, 5, W - 8);
      ctx.fillRect(-L * 0.2, -W / 2 + 4, 4, W - 8);
    }

    // roof detail
    ctx.fillStyle = shade(c.color, 1.18);
    rrPath(ctx, -L * 0.14, -W / 2 + 5, L * 0.26, W - 10, 3);
    ctx.fill();

    if (c.type === 'taxi') {
      ctx.fillStyle = '#15151b';
      ctx.fillRect(-6, -W / 2 + 4, 12, 5);
      ctx.fillStyle = '#ffd12d';
      ctx.fillRect(-4, -W / 2 + 5, 8, 3);
    }
    if (c.role === 'police') {
      // lightbar
      ctx.fillStyle = '#15151b';
      ctx.fillRect(-8, -W / 2 + 3, 14, W - 6);
      const on = Math.floor(game.time * 6 + c.id) % 2 === 0;
      ctx.fillStyle = on ? '#ff3040' : '#3a3a44';
      ctx.fillRect(-6, -W / 2 + 4, 5, W - 8);
      ctx.fillStyle = on ? '#3a3a8f' : '#3050ff';
      ctx.fillRect(0, -W / 2 + 4, 5, W - 8);
      // livery
      ctx.fillStyle = '#1a2f5f';
      ctx.fillRect(-L * 0.42, -W / 2 + 2, L * 0.16, 3);
      ctx.fillRect(-L * 0.42, W / 2 - 5, L * 0.16, 3);
    }

    // headlights + taillights (drawn bright in glow pass)
    ctx.fillStyle = '#ffe8b0';
    ctx.fillRect(L / 2 - 3, -W / 2 + 3, 3, 4);
    ctx.fillRect(L / 2 - 3, W / 2 - 7, 3, 4);
    ctx.fillStyle = '#ff4030';
    ctx.fillRect(-L / 2, -W / 2 + 3, 2.5, 4);
    ctx.fillRect(-L / 2, W / 2 - 7, 2.5, 4);

    // damage scratches
    if (hpF < 0.75) {
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(-L * 0.3, -W / 2 + 1, 10, 2);
      if (hpF < 0.4) ctx.fillRect(L * 0.1, W / 2 - 3, 14, 2);
    }
    ctx.restore();
  }

  drawBullets(game) {
    const ctx = this.ctx;
    ctx.strokeStyle = rgba('#ffe8a0', 0.9);
    ctx.lineWidth = 2;
    for (const b of game.fx.bullets) {
      ctx.beginPath();
      ctx.moveTo(b.x, b.y);
      ctx.lineTo(b.x - b.vx * 0.014, b.y - b.vy * 0.014);
      ctx.stroke();
    }
  }

  /** Particles. glow=false draws smoke; glow=true draws fire/spark/flash additively. */
  drawParticles(game, glow) {
    const ctx = this.ctx;
    for (const p of game.fx.parts) {
      const lf = p.life / p.max;
      if (!glow && p.type === 'smoke') {
        ctx.fillStyle = 'rgba(70,74,84,' + (0.34 * lf).toFixed(3) + ')';
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (2 - lf), 0, 7);
        ctx.fill();
      } else if (glow && p.type === 'fire') {
        ctx.fillStyle = 'rgba(255,' + (120 + lf * 100 | 0) + ',40,' + (0.5 * lf).toFixed(3) + ')';
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * lf + 2, 0, 7);
        ctx.fill();
      } else if (glow && p.type === 'spark') {
        ctx.fillStyle = 'rgba(255,220,120,' + (0.9 * lf).toFixed(3) + ')';
        ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
      } else if (glow && p.type === 'flash') {
        const r = p.size * (2 - lf) * 6;
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
        g.addColorStop(0, 'rgba(255,230,170,' + (0.55 * lf).toFixed(3) + ')');
        g.addColorStop(1, 'rgba(255,150,60,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, 7);
        ctx.fill();
      }
    }
  }

  // ------------------------------------------------------------- train + heli

  /** The Palm Metro: rails, train segments, station platforms. */
  drawTrain(game) {
    const ctx = this.ctx;
    const t = game.train;
    if (!t) return;
    const cam = game.cam;
    const v = this.viewRect(cam);

    // rails (four straight runs around the ring)
    ctx.strokeStyle = 'rgba(150,160,175,0.35)';
    ctx.lineWidth = 2;
    for (const seg of [
      { a: { x: ROADS[1] - 30, y: ROADS[1] - 30 }, b: { x: ROADS[14] + 30, y: ROADS[1] - 30 } },
      { a: { x: ROADS[14] + 30, y: ROADS[1] - 30 }, b: { x: ROADS[14] + 30, y: ROADS[14] + 30 } },
      { a: { x: ROADS[14] + 30, y: ROADS[14] + 30 }, b: { x: ROADS[1] - 30, y: ROADS[14] + 30 } },
      { a: { x: ROADS[1] - 30, y: ROADS[14] + 30 }, b: { x: ROADS[1] - 30, y: ROADS[1] - 30 } },
    ]) {
      if (Math.max(seg.a.y, seg.b.y) < v.y || Math.min(seg.a.y, seg.b.y) > v.y + v.h) {
        if (seg.a.y === seg.b.y) continue;
      }
      if (Math.max(seg.a.x, seg.b.x) < v.x || Math.min(seg.a.x, seg.b.x) > v.x + v.w) {
        if (seg.a.x === seg.b.x) continue;
      }
      ctx.beginPath();
      ctx.moveTo(seg.a.x, seg.a.y);
      ctx.lineTo(seg.b.x, seg.b.y);
      ctx.stroke();
    }

    // station platforms
    ctx.fillStyle = 'rgba(255,209,45,0.18)';
    for (const st of STATIONS) {
      if (st.x < v.x - 60 || st.x > v.x + v.w + 60 || st.y < v.y - 60 || st.y > v.y + v.h + 60) continue;
      ctx.fillRect(st.x - 44, st.y - 14, 88, 28);
      shadowText(ctx, 'METRO', st.x, st.y - 20, 11, 'rgba(255,209,45,0.85)', 'center', '');
    }

    // the train itself
    for (let k = t.segs.length - 1; k >= 0; k--) {
      const seg = t.segs[k];
      if (seg.x < v.x - 120 || seg.x > v.x + v.w + 120 || seg.y < v.y - 120 || seg.y > v.y + v.h + 120) continue;
      ctx.save();
      ctx.translate(seg.x, seg.y);
      ctx.rotate(seg.h);
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.fillRect(-33, -11, 70, 26);
      ctx.fillStyle = k === 0 ? '#c9ccd6' : '#8f98a8';
      rrPath(ctx, -33, -12, 66, 24, 6);
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.5)';
      ctx.lineWidth = 1;
      ctx.stroke();
      // lit windows
      ctx.fillStyle = 'rgba(255,224,150,0.85)';
      for (let wx = -24; wx <= 20; wx += 12) ctx.fillRect(wx, -9, 7, 5);
      ctx.fillStyle = 'rgba(35,230,255,0.9)';
      if (k === 0) ctx.fillRect(28, -8, 4, 16);
      ctx.restore();
    }
  }

  /** The police helicopter: shadow, hull, rotors; searchlight in glow pass. */
  drawHeli(game) {
    const ctx = this.ctx;
    const heli = game.police && game.police.heli;
    if (!heli) return;
    const spin = this.t * 22;

    // ground shadow
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(heli.x + 14, heli.y + 20, 26, 12, 0, 0, 7);
    ctx.fill();

    ctx.save();
    ctx.translate(heli.x, heli.y);
    ctx.rotate(heli.h);
    // tail
    ctx.fillStyle = '#1a2f5f';
    ctx.fillRect(-34, -3, 26, 6);
    ctx.fillRect(-40, -7, 8, 14);
    // body
    ctx.fillStyle = '#2b4a8f';
    rrPath(ctx, -14, -11, 34, 22, 9);
    ctx.fill();
    ctx.fillStyle = 'rgba(140,190,235,0.75)';
    ctx.beginPath();
    ctx.arc(12, 0, 7.5, 0, 7);
    ctx.fill();
    ctx.restore();

    // main rotor (spinning blur)
    ctx.save();
    ctx.translate(heli.x, heli.y);
    ctx.rotate(spin);
    ctx.strokeStyle = 'rgba(200,210,230,0.55)';
    ctx.lineWidth = 3;
    for (let k = 0; k < 2; k++) {
      ctx.beginPath();
      ctx.moveTo(Math.cos(k * Math.PI) * 34, Math.sin(k * Math.PI) * 34);
      ctx.lineTo(Math.cos(k * Math.PI + Math.PI) * 34, Math.sin(k * Math.PI + Math.PI) * 34);
      ctx.stroke();
    }
    ctx.restore();
    // strobe
    if (Math.floor(this.t * 5) % 2 === 0) {
      ctx.fillStyle = '#ff3040';
      ctx.beginPath();
      ctx.arc(heli.x - 36, heli.y, 2.5, 0, 7);
      ctx.fill();
    }
  }

  // ------------------------------------------------------------- glow + sheen

  drawSheen(game) {
    const ctx = this.ctx;
    const v = this.viewRect(game.cam);
    const t = this.t;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    // wet-road sheen: drifting specular bands on asphalt
    for (const ry of ROADS) {
      if (ry < v.y - HALF || ry > v.y + v.h + HALF) continue;
      const g = ctx.createLinearGradient(0, ry - HALF, 0, ry + HALF);
      const off = ((t * 60) % 260) / 260;
      g.addColorStop(0, 'rgba(120,160,220,0)');
      g.addColorStop(clamp(off, 0.01, 0.99), 'rgba(120,160,220,0.05)');
      g.addColorStop(1, 'rgba(120,160,220,0)');
      ctx.fillStyle = g;
      ctx.fillRect(v.x, ry - HALF, v.w, ROAD_W);
    }
    for (const rx of ROADS) {
      if (rx < v.x - HALF || rx > v.x + v.w + HALF) continue;
      const g = ctx.createLinearGradient(rx - HALF, 0, rx + HALF, 0);
      const off = ((t * 47 + 90) % 260) / 260;
      g.addColorStop(0, 'rgba(120,160,220,0)');
      g.addColorStop(clamp(off, 0.01, 0.99), 'rgba(120,160,220,0.04)');
      g.addColorStop(1, 'rgba(120,160,220,0)');
      ctx.fillStyle = g;
      ctx.fillRect(rx - HALF, v.y, ROAD_W, v.h);
    }
    ctx.restore();
  }

  drawGlow(game) {
    const ctx = this.ctx;
    const v = this.viewRect(game.cam);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    // street lamp halos
    for (const l of game.world.lamps) {
      if (l.x < v.x || l.x > v.x + v.w || l.y < v.y || l.y > v.y + v.h) continue;
      const g = ctx.createRadialGradient(l.x, l.y, 2, l.x, l.y, 78);
      g.addColorStop(0, 'rgba(255,214,140,0.28)');
      g.addColorStop(1, 'rgba(255,214,140,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(l.x, l.y, 78, 0, 7);
      ctx.fill();
    }

    // neon signs
    for (const n of game.world.neons) {
      const nx = n.x + n.w / 2, ny = n.y + n.h / 2;
      if (nx < v.x || nx > v.x + v.w || ny < v.y || ny > v.y + v.h) continue;
      const pulse = 0.85 + Math.sin(this.t * 7 + nx * 0.11) * 0.15;
      const r = Math.max(n.w, n.h) * 0.9 + 26;
      const g = ctx.createRadialGradient(nx, ny, 2, nx, ny, r);
      g.addColorStop(0, rgba(n.col, 0.5 * pulse));
      g.addColorStop(1, rgba(n.col, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(nx, ny, r, 0, 7);
      ctx.fill();
      ctx.fillStyle = rgba(n.col, 0.95 * pulse);
      ctx.fillRect(n.x, n.y, n.w, n.h);
    }

    // traffic light states
    for (const c of game.world.crossings) {
      if (c.x < v.x || c.x > v.x + v.w || c.y < v.y || c.y > v.y + v.h) continue;
      const st0 = lightFor(c.i, c.j, 0, this.t);
      const st1 = lightFor(c.i, c.j, 1, this.t);
      const px = c.x + HALF + 6, py = c.y + HALF + 6;
      const col0 = st0 === 'green' ? '#30ff70' : st0 === 'yellow' ? '#ffc830' : '#ff3040';
      const col1 = st1 === 'green' ? '#30ff70' : st1 === 'yellow' ? '#ffc830' : '#ff3040';
      ctx.fillStyle = col0;
      ctx.beginPath();
      ctx.arc(px + 4, py + 3, 2.4, 0, 7);
      ctx.fill();
      ctx.fillStyle = col1;
      ctx.beginPath();
      ctx.arc(px, py + 9, 2.4, 0, 7);
      ctx.fill();
      // small floor glow
      const g = ctx.createRadialGradient(px, py, 1, px, py, 26);
      g.addColorStop(0, rgba(st0 === 'green' ? '#30ff70' : '#ff3040', 0.16));
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(px, py, 26, 0, 7);
      ctx.fill();
    }

    // vehicle lights
    for (const c of game.cars) {
      if (c.x < v.x - 120 || c.x > v.x + v.w + 120 || c.y < v.y - 120 || c.y > v.y + v.h + 120) continue;
      if (c.dead) continue;
      const L = c.spec.l, W = c.spec.w;
      const cos = Math.cos(c.h), sin = Math.sin(c.h);
      // headlights
      if (c.lightsOn) {
        ctx.save();
        ctx.translate(c.x + cos * L * 0.5, c.y + sin * L * 0.5);
        ctx.rotate(c.h);
        const g = ctx.createRadialGradient(0, 0, 4, 0, 0, 120);
        g.addColorStop(0, 'rgba(255,236,170,0.30)');
        g.addColorStop(1, 'rgba(255,236,170,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(-6, -W * 0.4);
        ctx.lineTo(118, -52);
        ctx.lineTo(118, 52);
        ctx.lineTo(-6, W * 0.4);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
        // tail glow
        const bx = c.x - cos * L * 0.5, by = c.y - sin * L * 0.5;
        const tg = ctx.createRadialGradient(bx, by, 1, bx, by, 22);
        tg.addColorStop(0, 'rgba(255,64,48,0.4)');
        tg.addColorStop(1, 'rgba(255,64,48,0)');
        ctx.fillStyle = tg;
        ctx.beginPath();
        ctx.arc(bx, by, 22, 0, 7);
        ctx.fill();
      }
      // siren strobes
      if (c.role === 'police') {
        const on = Math.floor(this.t * 6 + c.id) % 2 === 0;
        const s1 = ctx.createRadialGradient(c.x, c.y, 2, c.x, c.y, 90);
        s1.addColorStop(0, on ? 'rgba(255,48,64,0.4)' : 'rgba(48,80,255,0.4)');
        s1.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = s1;
        ctx.beginPath();
        ctx.arc(c.x, c.y, 90, 0, 7);
        ctx.fill();
      }
      // fire glow
      if (c.onFire) {
        const fg = ctx.createRadialGradient(c.x, c.y, 4, c.x, c.y, 110);
        fg.addColorStop(0, 'rgba(255,140,40,0.5)');
        fg.addColorStop(1, 'rgba(255,80,20,0)');
        ctx.fillStyle = fg;
        ctx.beginPath();
        ctx.arc(c.x, c.y, 110, 0, 7);
        ctx.fill();
      }
    }

    // helicopter searchlight
    const heli = game.police && game.police.heli;
    if (heli && !heli.leave) {
      const g = ctx.createRadialGradient(heli.x, heli.y, 6, heli.x, heli.y, 135);
      g.addColorStop(0, 'rgba(255,250,220,0.4)');
      g.addColorStop(0.6, 'rgba(255,250,220,0.14)');
      g.addColorStop(1, 'rgba(255,250,220,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(heli.x, heli.y, 135, 0, 7);
      ctx.fill();
    }

    // marker glow rings
    for (const m of game.markers) {
      const g = ctx.createRadialGradient(m.x, m.y, 4, m.x, m.y, 42);
      g.addColorStop(0, rgba(m.col, 0.4));
      g.addColorStop(1, rgba(m.col, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(m.x, m.y, 42, 0, 7);
      ctx.fill();
    }

    // pickup glints
    for (const p of game.pickups) {
      const g = ctx.createRadialGradient(p.x, p.y, 1, p.x, p.y, 18);
      g.addColorStop(0, 'rgba(255,255,220,0.25)');
      g.addColorStop(1, 'rgba(255,255,220,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 18, 0, 7);
      ctx.fill();
    }

    ctx.restore();
  }

  // ------------------------------------------------------------- minimap

  buildMinimap(game) {
    const cv = document.createElement('canvas');
    cv.width = MM;
    cv.height = MM;
    const c = cv.getContext('2d');
    const S = MMS;

    c.fillStyle = '#11141c';
    c.fillRect(0, 0, MM, MM);
    // water
    c.fillStyle = '#123048';
    c.fillRect(0, 0, 130 * S, MM);
    // beach sand
    c.fillStyle = '#54452c';
    c.fillRect(130 * S, 0, (556 - 130) * S, MM);
    // blocks
    for (const b of game.world.blocks) {
      if (b.district === 'park') c.fillStyle = '#1c4028';
      else if (b.district === 'docks') c.fillStyle = '#33302a';
      else if (b.district === 'airfield') c.fillStyle = '#20242e';
      else continue;
      c.fillRect(b.x * S, b.y * S, b.w * S, b.h * S);
    }
    // roads
    c.strokeStyle = '#565d6e';
    c.lineWidth = ROAD_W * S * 0.8;
    for (const r of ROADS) {
      c.beginPath();
      c.moveTo(80 * S, r * S);
      c.lineTo((WORLD - 80) * S, r * S);
      c.stroke();
      c.beginPath();
      c.moveTo(r * S, 80 * S);
      c.lineTo(r * S, (WORLD - 80) * S);
      c.stroke();
    }
    // runway
    const r = game.world.runway;
    if (r) {
      c.strokeStyle = '#8a8f9c';
      c.lineWidth = 3;
      c.beginPath();
      c.moveTo(r.x * S, (r.y + r.h / 2) * S);
      c.lineTo((r.x + r.w) * S, (r.y + r.h / 2) * S);
      c.stroke();
    }
    // ship
    const sh = game.world.ship;
    if (sh) {
      c.fillStyle = '#7a828f';
      c.fillRect(sh.x * S, sh.y * S, sh.w * S, sh.h * S);
    }
    this.mmBase = cv;
    return cv;
  }

  /** Circular minimap with blips; drawn by the HUD at (x, y) radius r. */
  drawMinimap(ctx, game, cx, cy, r) {
    if (!this.mmBase) this.buildMinimap(game);
    const p = game.player;
    const Z = 2.1; // zoom over the base texture
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, 7);
    ctx.clip();
    ctx.fillStyle = '#11141c';
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    ctx.translate(cx, cy);
    ctx.scale(Z, Z);
    ctx.drawImage(this.mmBase, -p.x * MMS, -p.y * MMS);
    ctx.restore();

    // blips (screen space around the circle center)
    const blip = (wx, wy, col, rad) => {
      const bx = cx + (wx - p.x) * MMS * Z;
      const by = cy + (wy - p.y) * MMS * Z;
      const d = Math.hypot(bx - cx, by - cy);
      const rr = Math.min(rad, r - 6);
      let px = bx, py = by;
      if (d > r - 8) {
        px = cx + ((bx - cx) / d) * (r - 10);
        py = cy + ((by - cy) / d) * (r - 10);
      }
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.arc(px, py, rr, 0, 7);
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.6)';
      ctx.lineWidth = 1;
      ctx.stroke();
    };
    for (const m of game.markers) blip(m.x, m.y, m.col, 5);
    for (const pk of game.pickups) {
      if (pk.tag === 'mission') blip(pk.x, pk.y, '#ffd12d', 3);
    }
    const on = Math.floor(game.time * 6) % 2 === 0;
    for (const c of game.cars) {
      if (c.role === 'police' && !c.dead) blip(c.x, c.y, on ? '#ff3040' : '#3050ff', 3.4);
    }
    // player arrow
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(game.player.h);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(7, 0);
    ctx.lineTo(-5, -5);
    ctx.lineTo(-2.5, 0);
    ctx.lineTo(-5, 5);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.7)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();

    // rim
    ctx.strokeStyle = 'rgba(210,220,240,0.5)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, 7);
    ctx.stroke();
  }
}
