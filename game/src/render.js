// render.js — the whole picture: night base pass, pseudo-3D buildings with
// neon trim, wet-road sheen, headlight cones, explosions with flash + shake
// support, and the minimap painter the HUD borrows.

import { CFG } from './config.js';
import { G } from './world.js';
import { clamp, TAU } from './util.js';

const N = CFG.NIGHT;

export class Renderer {
  constructor(game) {
    this.game = game;
    this.t = 0;
    this.groundChunks = new Map();
  }

  draw(ctx) {
    const game = this.game;
    const W = game.viewW, H = game.viewH;
    this.t = game.time;

    ctx.fillStyle = N.sky;
    ctx.fillRect(0, 0, W, H);

    const cam = game.cam;
    const shx = (Math.random() - 0.5) * cam.shake * 2;
    const shy = (Math.random() - 0.5) * cam.shake * 2;

    ctx.save();
    ctx.translate(W / 2 + shx, H / 2 + shy);
    ctx.scale(cam.zoom, cam.zoom);
    ctx.translate(-cam.x, -cam.y);

    const view = this.viewRect();

    this.drawGround(ctx, view);
    this.drawGroundProps(ctx, view);
    this.drawSheen(ctx, view);
    this.drawDecals(ctx);
    if (this.game.tokens) this.game.tokens.draw(ctx);
    if (this.game.gunshops) this.game.gunshops.draw(ctx);
    if (this.game.delivery) this.game.delivery.draw(ctx);
    if (this.game.police.drawSpikes) this.game.police.drawSpikes(ctx);
    this.drawMarkers(ctx);
    this.drawBuildings(ctx, view);
    this.drawBigProps(ctx, view);
    this.drawPeds(ctx);
    this.drawCops(ctx);
    if (this.game.pigeons) this.game.pigeons.draw(ctx, view);
    if (this.game.state !== 'title') this.drawPlayer(ctx);
    this.drawCars(ctx, view);
    this.drawBoats(ctx, view);
    this.drawBullets(ctx);
    this.drawEffects(ctx);
    if (this.game.heli) this.game.heli.draw(ctx);
    ctx.restore();

    this.drawFlash(ctx, W, H);
    this.drawVignette(ctx, W, H);
    if (this.game.weather) this.game.weather.drawRain(ctx);
  }

  viewRect() {
    const game = this.game;
    const halfW = game.viewW / 2 / game.cam.zoom + 64;
    const halfH = game.viewH / 2 / game.cam.zoom + 64;
    return {
      x0: game.cam.x - halfW, y0: game.cam.y - halfH,
      x1: game.cam.x + halfW, y1: game.cam.y + halfH,
    };
  }

  // ------------------------------------------------------------- ground

  drawGround(ctx, view) {
    const game = this.game;
    const world = game.world;
    const T = CFG.T;
    // fast path: cached 512px ground chunks (static tiles), then live water
    const CH = 512;
    const ct = CH / T;                       // tiles per chunk
    const cx0 = Math.max(0, Math.floor(view.x0 / CH));
    const cy0 = Math.max(0, Math.floor(view.y0 / CH));
    const cx1 = Math.min(Math.ceil(CFG.W / CH) - 1, Math.floor(view.x1 / CH));
    const cy1 = Math.min(Math.ceil(CFG.H / CH) - 1, Math.floor(view.y1 / CH));
    for (let cy = cy0; cy <= cy1; cy++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        const chunk = this.groundChunk(cx, cy, ct);
        ctx.drawImage(chunk, cx * CH, cy * CH);
      }
    }
    // animated water sits on top of the cache
    const tx0 = Math.max(0, Math.floor(view.x0 / T));
    const ty0 = Math.max(0, Math.floor(view.y0 / T));
    const tx1 = Math.min(CFG.WT - 1, Math.ceil(view.x1 / T));
    const ty1 = Math.min(CFG.HT - 1, Math.ceil(view.y1 / T));
    const time = this.t;
    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        if (world.at(tx, ty) !== G.WATER) continue;
        this.tileWater(ctx, tx, ty, tx * T, ty * T, time);
      }
    }
  }

  /** LRU cache of prerendered ground chunks (static tiles only). */
  groundChunk(cx, cy, ct) {
    const key = cx + ':' + cy;
    let cv = this.groundChunks.get(key);
    if (cv) {
      // refresh LRU position
      this.groundChunks.delete(key);
      this.groundChunks.set(key, cv);
      return cv;
    }
    cv = document.createElement('canvas');
    cv.width = 512;
    cv.height = 512;
    const c2 = cv.getContext('2d');
    const world = this.game.world;
    const T = CFG.T;
    const tx0 = cx * ct, ty0 = cy * ct;
    for (let i = 0; i < ct; i++) {
      for (let j = 0; j < ct; j++) {
        const tx = tx0 + j, ty = ty0 + i;
        if (tx >= CFG.WT || ty >= CFG.HT) continue;
        const code = world.at(tx, ty);
        const x = j * T, y = i * T;
        switch (code) {
          case G.ROAD: this.tileRoad(c2, world, tx, ty, x, y); break;
          case G.WATER: break; // drawn live each frame
          case G.SAND: this.tileSand(c2, x, y, tx, ty); break;
          case G.GRASS: this.tileGrass(c2, x, y, tx, ty); break;
          case G.RUNWAY: this.tileRunway(c2, world, tx, ty, x, y); break;
          case G.DOCKPAD: this.tileDock(c2, tx, ty, x, y); break;
          case G.PIER: this.tilePier(c2, x, y, tx, ty); break;
          case G.BUILDING: c2.fillStyle = N.roof; c2.fillRect(x, y, T, T); break;
          default: this.tilePlaza(c2, world, tx, ty, x, y); break;
        }
      }
    }
    this.groundChunks.set(key, cv);
    if (this.groundChunks.size > 44) {
      const oldest = this.groundChunks.keys().next().value;
      this.groundChunks.delete(oldest);
    }
    return cv;
  }

  tilePlaza(ctx, world, tx, ty, x, y) {
    ctx.fillStyle = N.sidewalk;
    ctx.fillRect(x, y, CFG.T, CFG.T);
    // curb next to roads
    if (world.at(tx + 1, ty) === G.ROAD || world.at(tx - 1, ty) === G.ROAD ||
        world.at(tx, ty + 1) === G.ROAD || world.at(tx, ty - 1) === G.ROAD) {
      ctx.fillStyle = N.sidewalkLine;
      if (world.at(tx + 1, ty) === G.ROAD) ctx.fillRect(x + CFG.T - 3, y, 3, CFG.T);
      if (world.at(tx - 1, ty) === G.ROAD) ctx.fillRect(x, y, 3, CFG.T);
      if (world.at(tx, ty + 1) === G.ROAD) ctx.fillRect(x, y + CFG.T - 3, CFG.T, 3);
      if (world.at(tx, ty - 1) === G.ROAD) ctx.fillRect(x, y, CFG.T, 3);
    }
    // faint pavement joints
    if ((tx * 7 + ty * 13) % 5 === 0) {
      ctx.fillStyle = 'rgba(0,0,0,0.08)';
      ctx.fillRect(x + 4, y + 4, CFG.T - 8, CFG.T - 8);
    }
  }

  tileRoad(ctx, world, tx, ty, x, y) {
    ctx.fillStyle = N.asphalt;
    ctx.fillRect(x, y, CFG.T, CFG.T);
    // center dashes on the pair boundary
    const vertical = world.at(tx, ty - 1) === G.ROAD || world.at(tx, ty + 1) === G.ROAD;
    if (vertical && world.at(tx - 1, ty) === G.ROAD) {
      if (ty % 2 === 0) {
        ctx.fillStyle = '#8b8f9a';
        ctx.fillRect(x - 1.5, y + 8, 3, 16);
      }
    } else if (!vertical && world.at(tx, ty - 1) === G.ROAD) {
      if (tx % 2 === 0) {
        ctx.fillStyle = '#8b8f9a';
        ctx.fillRect(x + 8, y - 1.5, 16, 3);
      }
    }
    // zebra crossings near intersections
    if (world.intersectionSet && world.intersectionSet.has(`${tx}:${ty}`)) {
      ctx.fillStyle = 'rgba(210, 210, 200, 0.5)';
      if (vertical) {
        ctx.fillRect(x + 5, y + 3, CFG.T - 10, 4);
        ctx.fillRect(x + 5, y + CFG.T - 8, CFG.T - 10, 4);
      } else {
        ctx.fillRect(x + 3, y + 5, 4, CFG.T - 10);
        ctx.fillRect(x + CFG.T - 8, y + 5, 4, CFG.T - 10);
      }
    }
    // gutter tone variation
    if ((tx * 31 + ty * 17) % 11 === 0) {
      ctx.fillStyle = 'rgba(0,0,0,0.12)';
      ctx.fillRect(x + 2, y + 2, CFG.T - 4, CFG.T - 4);
    }
  }

  tileWater(ctx, tx, ty, x, y, time) {
    ctx.fillStyle = N.water;
    ctx.fillRect(x, y, CFG.T, CFG.T);
    const w = Math.sin(time * 1.4 + tx * 0.9 + ty * 0.6);
    if (w > 0.4) {
      ctx.fillStyle = N.waterLit;
      ctx.fillRect(x + 4, y + (8 + ((tx * 5 + ty * 3) % 12)), CFG.T - 8, 2);
    }
  }

  tileSand(ctx, x, y, tx, ty) {
    ctx.fillStyle = ((tx + ty) % 2 === 0) ? N.sand : N.sandDark;
    ctx.fillRect(x, y, CFG.T, CFG.T);
    if ((tx * 13 + ty * 7) % 6 === 0) {
      ctx.fillStyle = 'rgba(0,0,0,0.06)';
      ctx.fillRect(x + 10, y + 12, 5, 3);
    }
  }

  tileGrass(ctx, x, y, tx, ty) {
    ctx.fillStyle = ((tx * 5 + ty * 3) % 4 === 0) ? N.grassDark : N.grass;
    ctx.fillRect(x, y, CFG.T, CFG.T);
    if ((tx * 11 + ty * 3) % 7 === 0) {
      ctx.fillStyle = 'rgba(90, 200, 110, 0.10)';
      ctx.fillRect(x + 6, y + 14, 8, 3);
    }
  }

  tileRunway(ctx, world, tx, ty, x, y) {
    ctx.fillStyle = N.runway;
    ctx.fillRect(x, y, CFG.T, CFG.T);
    // big painted centerline + threshold bars
    if (ty === 89 || ty === 90) {
      if (tx % 3 === 0) {
        ctx.fillStyle = '#c8c8b0';
        ctx.fillRect(x + 4, y + 12, CFG.T - 8, 8);
      }
    }
    if ((tx * 7 + ty) % 13 === 0) {
      ctx.fillStyle = 'rgba(0,0,0,0.10)';
      ctx.fillRect(x + 6, y + 6, 6, 6);
    }
    void world;
  }

  tileDock(ctx, tx, ty, x, y) {
    ctx.fillStyle = N.dockPad;
    ctx.fillRect(x, y, CFG.T, CFG.T);
    // yard lane paint
    if (ty % 4 === 1 && tx % 6 === 2) {
      ctx.fillStyle = '#c9a13b';
      ctx.fillRect(x + 2, y + 14, 12, 3);
    }
  }

  tilePier(ctx, x, y, tx, ty) {
    ctx.fillStyle = '#4a3d2c';
    ctx.fillRect(x, y, CFG.T, CFG.T);
    ctx.fillStyle = '#3a3024';
    if (tx % 2 === 0) ctx.fillRect(x, y, 2, CFG.T);
    if (ty % 2 === 0) ctx.fillRect(x, y, CFG.T, 2);
  }

  // ---------------------------------------------------------- sheen/glow

  /** Wet-road sheen: a soft smear under every light, drawn before objects. */
  drawSheen(ctx, view) {
    const game = this.game;
    ctx.globalCompositeOperation = 'lighter';
    for (const l of game.world.lights) {
      if (l.x < view.x0 - 120 || l.x > view.x1 + 120 || l.y < view.y0 - 120 || l.y > view.y1 + 120) continue;
      const grad = ctx.createRadialGradient(l.x, l.y, 4, l.x, l.y, l.r * 1.15);
      grad.addColorStop(0, N.sheen);
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grad;
      ctx.save();
      ctx.translate(l.x, l.y);
      ctx.scale(1.5, 0.9);
      ctx.beginPath();
      ctx.arc(0, 0, l.r, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  // -------------------------------------------------------------- decals

  drawDecals(ctx) {
    const game = this.game;
    const view = this.viewRect();
    for (const d of game.decals) {
      if (d.x < view.x0 - 60 || d.x > view.x1 + 60 || d.y < view.y0 - 60 || d.y > view.y1 + 60) continue;
      ctx.save();
      ctx.translate(d.x, d.y);
      if (d.type === 'tire') {
        ctx.rotate(d.ang);
        ctx.fillStyle = `rgba(20,20,24,${0.35 * d.alpha})`;
        ctx.fillRect(-d.len / 2, -2.2, d.len, 4.4);
      } else if (d.type === 'scorch') {
        ctx.fillStyle = `rgba(8,8,10,${0.55 * d.alpha})`;
        ctx.beginPath();
        ctx.arc(0, 0, d.r, 0, TAU);
        ctx.fill();
      } else if (d.type === 'blood') {
        ctx.fillStyle = `rgba(110, 12, 20, ${0.5 * d.alpha})`;
        ctx.beginPath();
        ctx.ellipse(0, 0, d.r * 1.4, d.r, 0.4, 0, TAU);
        ctx.fill();
      } else if (d.type === 'skid') {
        ctx.rotate(d.ang);
        ctx.fillStyle = `rgba(10,10,12,${0.3 * d.alpha})`;
        ctx.fillRect(-d.len / 2, -6, d.len, 3);
        ctx.fillRect(-d.len / 2, 3, d.len, 3);
      } else if (d.type === 'puddle') {
        // rainwater pooling on the asphalt, shimmering slightly
        ctx.rotate(d.ang || 0);
        const shim = 0.75 + 0.25 * Math.sin(this.t * 2 + d.x);
        ctx.fillStyle = `rgba(120, 170, 220, ${0.09 * d.alpha * shim})`;
        ctx.beginPath();
        ctx.ellipse(0, 0, d.r, d.r * 0.55, 0, 0, TAU);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  // ------------------------------------------------------------- markers

  drawMarkers(ctx) {
    const game = this.game;
    const pulse = 0.6 + 0.4 * Math.sin(this.t * 4);
    for (const m of game.missions.markers()) {
      const col = m.kind === 'story' ? '#ffd23d'
        : m.kind === 'side' ? '#5cff8a'
        : m.kind === 'checkpoint' ? '#37f5ff' : '#ffd23d';
      ctx.save();
      ctx.translate(m.pos.x, m.pos.y);
      ctx.globalAlpha = 0.28 + 0.25 * pulse;
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.arc(0, 0, m.kind === 'checkpoint' ? 52 : CFG.MARKER_R, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 0.9;
      ctx.strokeStyle = col;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(0, 0, (m.kind === 'checkpoint' ? 52 : CFG.MARKER_R) * (0.55 + 0.2 * pulse), 0, TAU);
      ctx.stroke();
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  // ------------------------------------------------------------ buildings

  drawBuildings(ctx, view) {
    const game = this.game;
    const cam = game.cam;
    for (const b of game.world.buildings) {
      if (b.x1 < view.x0 - 40 || b.x0 > view.x1 + 40 || b.y1 < view.y0 - 40 || b.y0 > view.y1 + 40) continue;
      const cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
      // extrusion away from camera centre (fake perspective)
      const k = 0.0016 * b.h;
      const ox = (cx - cam.x) * k * cam.zoom;
      const oy = (cy - cam.y) * k * cam.zoom;
      this.drawBuildingWalls(ctx, b, ox, oy);
      this.drawBuildingRoof(ctx, b, ox, oy);
    }
    // glow pass for neon
    ctx.globalCompositeOperation = 'lighter';
    for (const l of game.world.lights) {
      if (l.x < view.x0 - 100 || l.x > view.x1 + 100 || l.y < view.y0 - 100 || l.y > view.y1 + 100) continue;
      const grad = ctx.createRadialGradient(l.x, l.y, 6, l.x, l.y, l.r);
      grad.addColorStop(0, hexA(l.color, 0.20));
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(l.x, l.y, l.r, 0, TAU);
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  drawBuildingWalls(ctx, b, ox, oy) {
    const n = b.neon ? b.neon.color : null;
    // only draw the two walls that face the camera-ish direction
    const faces = [];
    if (oy < 0) faces.push({ x0: b.x0, y0: b.y0, x1: b.x1, y1: b.y0, nx: 0, ny: -1 });
    if (oy > 0) faces.push({ x0: b.x0, y0: b.y1, x1: b.x1, y1: b.y1, nx: 0, ny: 1 });
    if (ox < 0) faces.push({ x0: b.x0, y0: b.y0, x1: b.x0, y1: b.y1, nx: -1, ny: 0 });
    if (ox > 0) faces.push({ x0: b.x1, y0: b.y0, x1: b.x1, y1: b.y1, nx: 1, ny: 0 });
    const wallBase = b.style === 'glass' ? '#1c2634' : b.style === 'brick' ? '#241c1a' : N.wall;
    for (const f of faces) {
      const vertical = f.nx !== 0;
      const len = vertical ? (f.y1 - f.y0) : (f.x1 - f.x0);
      ctx.fillStyle = wallBase;
      ctx.beginPath();
      if (vertical) {
        ctx.moveTo(f.x0, f.y0); ctx.lineTo(f.x0 + ox, f.y0 + oy);
        ctx.lineTo(f.x0 + ox, f.y1 + oy); ctx.lineTo(f.x0, f.y1);
      } else {
        ctx.moveTo(f.x0, f.y0); ctx.lineTo(f.x0 + ox, f.y0 + oy);
        ctx.lineTo(f.x1 + ox, f.y0 + oy); ctx.lineTo(f.x1, f.y0);
      }
      ctx.closePath();
      ctx.fill();
      // windows: rows of lit/unlit panes along the wall
      const seed = b.seed;
      const rows = clamp(Math.round(b.h / 14), 1, 8);
      const cols = clamp(Math.round(len / 26), 1, 10);
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const v = ((seed + r * 73856093 ^ c * 19349663) >>> 0) % 100;
          const lit = v < 34;
          const t0 = (c + 0.25) / cols, t1 = (c + 0.75) / cols;
          const hh = (r + 0.45) / (rows + 0.5);
          let wx, wy, ww, wh;
          if (vertical) {
            wx = f.x0 + ox * hh; wy = f.y0 + (f.y1 - f.y0) * t0 + oy * hh;
            ww = 3; wh = (f.y1 - f.y0) * (t1 - t0) * 0.7;
          } else {
            wx = f.x0 + (f.x1 - f.x0) * t0 + ox * hh; wy = f.y0 + oy * hh;
            ww = (f.x1 - f.x0) * (t1 - t0) * 0.7; wh = 3;
          }
          ctx.fillStyle = lit ? N.window : N.windowDim;
          ctx.fillRect(wx, wy, Math.max(1.5, ww), Math.max(1.5, wh));
        }
      }
      if (n) {
        ctx.strokeStyle = n;
        ctx.lineWidth = 1.6;
        ctx.globalAlpha = 0.85;
        ctx.beginPath();
        if (vertical) {
          ctx.moveTo(f.x0 + ox, f.y0 + oy); ctx.lineTo(f.x0 + ox, f.y1 + oy);
        } else {
          ctx.moveTo(f.x0 + ox, f.y0 + oy); ctx.lineTo(f.x1 + ox, f.y0 + oy);
        }
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }
  }

  drawBuildingRoof(ctx, b, ox, oy) {
    const rx0 = b.x0 + ox, ry0 = b.y0 + oy, rx1 = b.x1 + ox, ry1 = b.y1 + oy;
    ctx.fillStyle = b.style === 'glass' ? '#141a26' : b.style === 'hangar' ? '#1d2129' : N.roofLit;
    ctx.fillRect(rx0, ry0, rx1 - rx0, ry1 - ry0);
    // roof edge
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 1;
    ctx.strokeRect(rx0 + 0.5, ry0 + 0.5, rx1 - rx0 - 1, ry1 - ry0 - 1);
    // roof clutter for taller buildings
    if (b.h > 40) {
      const seed = b.seed;
      const n = 2 + (seed % 3);
      for (let i = 0; i < n; i++) {
        const vx = rx0 + 8 + ((seed * (i + 3)) % Math.max(8, (rx1 - rx0) - 20));
        const vy = ry0 + 8 + ((seed * (i + 7)) % Math.max(8, (ry1 - ry0) - 20));
        ctx.fillStyle = '#0e1016';
        ctx.fillRect(vx, vy, 9, 7);
        ctx.fillStyle = 'rgba(255,255,255,0.06)';
        ctx.fillRect(vx + 2, vy + 2, 3, 2);
      }
      // blinking red beacon
      if ((b.seed % 5) === 0) {
        const on = Math.sin(this.t * 2.4 + b.seed) > 0.2;
        if (on) {
          ctx.fillStyle = '#ff5c5c';
          ctx.beginPath();
          ctx.arc((rx0 + rx1) / 2, (ry0 + ry1) / 2, 2.2, 0, TAU);
          ctx.fill();
        }
      }
      // antenna mast on the tallest towers
      if (b.h > 80) {
        const ax = (rx0 + rx1) / 2, ay = (ry0 + ry1) / 2;
        ctx.strokeStyle = '#3a3f48';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(ax + 2, ay - 16);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(255, 90, 90, 0.5)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(ax + 2, ay - 16);
        ctx.lineTo(ax + 8, ay - 12);
        ctx.moveTo(ax + 2, ay - 16);
        ctx.lineTo(ax - 4, ay - 12);
        ctx.stroke();
      }
    }
    // hotel / club rooftop sign
    if (b.sign) {
      const col = b.neon ? b.neon.color : N.neonCyan;
      const cx2 = (rx0 + rx1) / 2, cy2 = (ry0 + ry1) / 2;
      ctx.font = 'bold 11px "Courier New", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillText(b.sign, cx2 + 1, cy2 + 1);
      ctx.fillStyle = col;
      ctx.fillText(b.sign, cx2, cy2);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
    }
  }

  // ------------------------------------------------------- big world props

  drawBigProps(ctx, view) {
    const game = this.game;
    // ship
    for (const s of game.world.solids) {
      if (s.kind !== 'ship') continue;
      if (s.x1 < view.x0 || s.x0 > view.x1 || s.y1 < view.y0 || s.y0 > view.y1) continue;
      ctx.fillStyle = '#232a33';
      ctx.fillRect(s.x0, s.y0, s.x1 - s.x0, s.y1 - s.y0);
      ctx.fillStyle = '#2e3742';
      ctx.fillRect(s.x0 + 8, s.y0 + 6, s.x1 - s.x0 - 16, s.y1 - s.y0 - 12);
      // containers on deck
      ctx.fillStyle = '#8a3c42';
      ctx.fillRect(s.x0 + 20, s.y0 + 10, 60, 20);
      ctx.fillStyle = '#3f6f8e';
      ctx.fillRect(s.x0 + 90, s.y0 + 10, 60, 20);
      // bridge
      ctx.fillStyle = '#1a1f26';
      ctx.fillRect(s.x1 - 60, s.y0 + 8, 26, s.y1 - s.y0 - 16);
      ctx.fillStyle = '#ffd23d';
      ctx.fillRect(s.x1 - 54, s.y0 + 12, 4, 4);
    }
    // cranes
    for (const cr of game.world.cranes) {
      if (cr.x < view.x0 - 200 || cr.x > view.x1 + 200) continue;
      ctx.fillStyle = '#3d434e';
      ctx.fillRect(cr.x - 8, cr.y - 8, 16, 40);
      ctx.save();
      ctx.translate(cr.x, cr.y);
      ctx.fillRect(-4, -6, 8, -(cr.span + 30));
      ctx.restore();
      ctx.strokeStyle = '#4d5460';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(cr.x, cr.y - 20);
      ctx.lineTo(cr.x + cr.span * cr.dir, cr.y - 26);
      ctx.stroke();
      // hanging container
      const hx = cr.x + cr.span * 0.6 * cr.dir;
      ctx.strokeStyle = '#20242c';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(hx, cr.y - 24);
      ctx.lineTo(hx, cr.y - 4);
      ctx.stroke();
      ctx.fillStyle = '#b54248';
      ctx.fillRect(hx - 14, cr.y - 4, 28, 12);
    }
    // airfield plane
    for (const p of game.world.props) {
      if (p.type !== 'plane') continue;
      if (p.x < view.x0 - 100 || p.x > view.x1 + 100 || p.y < view.y0 - 100 || p.y > view.y1 + 100) continue;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.fillStyle = '#7d8288';
      ctx.fillRect(-52, -5, 104, 10);           // fuselage
      ctx.fillRect(-6, -46, 12, 92);            // wings
      ctx.fillRect(-48, -14, 8, 28);            // tail plane
      ctx.fillStyle = '#39414c';
      ctx.fillRect(30, -3, 16, 6);
      ctx.fillStyle = '#c8ccd2';
      ctx.fillRect(-20, -4, 14, 8);
      ctx.restore();
    }
    // traffic lights at intersections
    for (const p of game.world.props) {
      if (p.type !== 'trafficlight') continue;
      if (p.x < view.x0 - 40 || p.x > view.x1 + 40 || p.y < view.y0 - 40 || p.y > view.y1 + 40) continue;
      this.drawTrafficLight(ctx, p);
    }
    // Pay 'n' Spray bays
    for (const key of ['spray1', 'spray2']) {
      const s = game.world.spawns[key];
      if (!s || s.x < view.x0 - 100 || s.x > view.x1 + 100 || s.y < view.y0 - 100 || s.y > view.y1 + 100) continue;
      this.drawSprayBay(ctx, s);
    }
    // trees, palms, umbrellas, lights on foot level
    for (const p of game.world.props) {
      if (p.x < view.x0 - 60 || p.x > view.x1 + 60 || p.y < view.y0 - 60 || p.y > view.y1 + 60) continue;
      switch (p.type) {
        case 'tree': {
          ctx.fillStyle = 'rgba(0,0,0,0.3)';
          ctx.beginPath(); ctx.ellipse(p.x + 4, p.y + 5, p.r * 0.5, p.r * 0.35, 0, 0, TAU); ctx.fill();
          ctx.fillStyle = p.variant === 0 ? '#1d5a2e' : p.variant === 1 ? '#256a37' : '#173f24';
          ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 0.5, 0, TAU); ctx.fill();
          ctx.fillStyle = 'rgba(255,255,255,0.05)';
          ctx.beginPath(); ctx.arc(p.x - p.r * 0.15, p.y - p.r * 0.15, p.r * 0.22, 0, TAU); ctx.fill();
          break;
        }
        case 'palm': {
          ctx.fillStyle = 'rgba(0,0,0,0.3)';
          ctx.beginPath(); ctx.ellipse(p.x + 6, p.y + 7, p.r * 0.4, p.r * 0.25, 0, 0, TAU); ctx.fill();
          ctx.strokeStyle = '#6b5230';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.quadraticCurveTo(p.x + 3, p.y - 4, p.x + 5, p.y - 9);
          ctx.stroke();
          const topX = p.x + 5, topY = p.y - 9;
          ctx.strokeStyle = p.variant % 2 ? '#2f7a3d' : '#276533';
          ctx.lineWidth = 2.4;
          for (let i = 0; i < 6; i++) {
            const a = (i / 6) * TAU + p.variant;
            ctx.beginPath();
            ctx.moveTo(topX, topY);
            ctx.quadraticCurveTo(topX + Math.cos(a) * 10, topY + Math.sin(a) * 6 - 4, topX + Math.cos(a) * 17, topY + Math.sin(a) * 10 + 3);
            ctx.stroke();
          }
          break;
        }
        case 'umbrella': {
          const col = ['#c94f4f', '#4fa3c9', '#c9b44f', '#5fc98a'][p.variant % 4];
          ctx.fillStyle = col;
          ctx.beginPath(); ctx.arc(p.x, p.y, 10, 0, TAU); ctx.fill();
          ctx.fillStyle = 'rgba(0,0,0,0.25)';
          ctx.beginPath(); ctx.arc(p.x + 3, p.y + 3, 10, 0, TAU); ctx.fill();
          ctx.fillStyle = col;
          ctx.beginPath(); ctx.arc(p.x - 1, p.y - 1, 9, 0, TAU); ctx.fill();
          break;
        }
        case 'towel': {
          const col = ['#c94f7c', '#4fa3c9', '#5fc98a'][p.variant % 3];
          ctx.fillStyle = col;
          ctx.fillRect(p.x - 8, p.y - 5, 16, 10);
          break;
        }
        case 'streetlight': {
          const flicker = Math.sin(this.t * 7 + p.x * 0.11 + p.y * 0.07);
          const dim = flicker < -0.93 ? 0.35 : 1;
          ctx.fillStyle = '#3a3f48';
          ctx.fillRect(p.x - 2, p.y - 2, 4, 4);
          ctx.fillStyle = `rgba(255, 179, 92, ${0.9 * dim})`;
          ctx.beginPath(); ctx.arc(p.x, p.y, 3, 0, TAU); ctx.fill();
          break;
        }
        case 'hydrant': {
          ctx.fillStyle = '#b03030';
          ctx.fillRect(p.x - 3, p.y - 4, 6, 8);
          break;
        }
        case 'bollard': {
          // weathered dock bollards
          ctx.fillStyle = p.variant === 0 ? '#3d434e' : p.variant === 1 ? '#4a4034' : '#38414a';
          ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, TAU); ctx.fill();
          ctx.fillStyle = 'rgba(0,0,0,0.35)';
          ctx.beginPath(); ctx.arc(p.x + 1, p.y + 1, 4, 0, TAU); ctx.fill();
          ctx.fillStyle = p.variant === 0 ? '#3d434e' : p.variant === 1 ? '#4a4034' : '#38414a';
          ctx.beginPath(); ctx.arc(p.x - 0.5, p.y - 0.5, 3.4, 0, TAU); ctx.fill();
          break;
        }
        case 'dumpster': {
          ctx.fillStyle = '#2c5a34';
          ctx.fillRect(p.x - 8, p.y - 5, 16, 10);
          ctx.fillStyle = '#204227';
          ctx.fillRect(p.x - 8, p.y - 5, 16, 3);
          break;
        }
        case 'bench': {
          ctx.fillStyle = '#4a3d2c';
          ctx.fillRect(p.x - 10, p.y - 2.5, 20, 5);
          ctx.fillStyle = '#3a3024';
          ctx.fillRect(p.x - 10, p.y - 2.5, 20, 1.5);
          ctx.fillStyle = '#2c2519';
          ctx.fillRect(p.x - 9, p.y + 2, 2, 3);
          ctx.fillRect(p.x + 7, p.y + 2, 2, 3);
          break;
        }
        case 'hotdog': {
          // the cart: umbrella, glass case, the smell of the city
          ctx.fillStyle = '#c94f4f';
          ctx.beginPath(); ctx.arc(p.x, p.y, 8.5, 0, TAU); ctx.fill();
          ctx.fillStyle = '#e8e2d4';
          ctx.fillRect(p.x - 6, p.y + 4, 12, 5);
          ctx.fillStyle = '#ffd23d';
          ctx.fillRect(p.x - 6, p.y + 2, 12, 2.5);
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          ctx.fillStyle = 'rgba(255, 200, 120, 0.14)';
          ctx.beginPath(); ctx.arc(p.x, p.y, 16, 0, TAU); ctx.fill();
          ctx.restore();
          break;
        }
        case 'coraltower': {
          // the penthouse landmark: a pale round tower with a lit crown
          ctx.fillStyle = 'rgba(0,0,0,0.3)';
          ctx.beginPath(); ctx.ellipse(p.x + 8, p.y + 10, p.r * 0.9, p.r * 0.7, 0, 0, TAU); ctx.fill();
          ctx.fillStyle = '#cfd6de';
          ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 0.82, 0, TAU); ctx.fill();
          ctx.fillStyle = '#b9c2cc';
          ctx.beginPath(); ctx.arc(p.x - 4, p.y - 4, p.r * 0.55, 0, TAU); ctx.fill();
          // spiral of lit windows climbing the tower
          for (let i = 0; i < 26; i++) {
            const a = i * 0.55;
            const rr = p.r * (0.3 + 0.42 * (i / 26));
            const lit = (i * 7) % 3 !== 0;
            ctx.fillStyle = lit ? N.window : N.windowDim;
            ctx.fillRect(p.x + Math.cos(a) * rr - 1.6, p.y + Math.sin(a) * rr - 1.6, 3.2, 3.2);
          }
          // neon crown
          const crown = 0.6 + 0.4 * Math.sin(this.t * 2.4);
          ctx.strokeStyle = N.neonPink;
          ctx.lineWidth = 2.5;
          ctx.globalAlpha = 0.5 + 0.4 * crown;
          ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 0.82, 0, TAU); ctx.stroke();
          ctx.globalAlpha = 1;
          break;
        }
        case 'garagefront': {
          // Rico's Garage: yellow roll door with painted lettering
          ctx.fillStyle = '#2a2f3a';
          ctx.fillRect(p.x - 34, p.y - 8, 68, 22);
          ctx.fillStyle = '#e0b23d';
          for (let i = 0; i < 5; i++) {
            ctx.fillRect(p.x - 30, p.y - 4 + i * 3.6, 60, 1.8);
          }
          ctx.font = 'bold 11px "Courier New", monospace';
          ctx.textAlign = 'center';
          ctx.fillStyle = '#e0b23d';
          ctx.fillText("RICO'S", p.x, p.y - 14);
          ctx.textAlign = 'left';
          break;
        }
        case 'fountain': {
          ctx.fillStyle = '#3a4148';
          ctx.beginPath(); ctx.arc(p.x, p.y, 14, 0, TAU); ctx.fill();
          ctx.fillStyle = '#175089';
          ctx.beginPath(); ctx.arc(p.x, p.y, 11, 0, TAU); ctx.fill();
          ctx.fillStyle = 'rgba(160,220,255,0.35)';
          const w = Math.sin(this.t * 3);
          ctx.beginPath(); ctx.arc(p.x + w * 2, p.y, 5, 0, TAU); ctx.fill();
          break;
        }
        case 'parkinglot': {
          ctx.fillStyle = '#23262d';
          ctx.fillRect(p.x0, p.y0, p.x1 - p.x0, p.y1 - p.y0);
          ctx.strokeStyle = 'rgba(230,230,200,0.22)';
          ctx.lineWidth = 2;
          for (let x = p.x0 + 20; x < p.x1 - 10; x += 34) {
            ctx.beginPath();
            ctx.moveTo(x, p.y0 + 8);
            ctx.lineTo(x, p.y0 + 56);
            ctx.stroke();
          }
          break;
        }
      }
    }
  }

  drawGroundProps(ctx, view) {
    void view;
    // (all ground props handled in drawBigProps for simplicity)
  }

  drawTrafficLight(ctx, p) {
    const game = this.game;
    const nsGreen = game.world.lightNS(p.ix, p.iy, game.time);
    const green = p.axis === 'ns' ? nsGreen : !nsGreen;
    // pole
    ctx.fillStyle = '#2c313b';
    ctx.fillRect(p.x - 1.5, p.y - 1.5, 3, 3);
    // head
    ctx.fillStyle = '#14171d';
    ctx.fillRect(p.x - 4, p.y - 16, 8, 15);
    // red / yellow / green lamps
    ctx.fillStyle = !green ? '#ff5c5c' : '#4a1518';
    ctx.beginPath(); ctx.arc(p.x, p.y - 13, 2, 0, TAU); ctx.fill();
    ctx.fillStyle = '#5a4a14';
    ctx.beginPath(); ctx.arc(p.x, p.y - 8.5, 2, 0, TAU); ctx.fill();
    ctx.fillStyle = green ? '#5cff8a' : '#123a20';
    ctx.beginPath(); ctx.arc(p.x, p.y - 4, 2, 0, TAU); ctx.fill();
    if (green) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(p.x, p.y - 4, 1, p.x, p.y - 4, 12);
      g.addColorStop(0, 'rgba(92,255,138,0.25)');
      g.addColorStop(1, 'rgba(92,255,138,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(p.x, p.y - 4, 12, 0, TAU); ctx.fill();
      ctx.restore();
    } else {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(p.x, p.y - 13, 1, p.x, p.y - 13, 12);
      g.addColorStop(0, 'rgba(255,92,92,0.25)');
      g.addColorStop(1, 'rgba(255,92,92,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(p.x, p.y - 13, 12, 0, TAU); ctx.fill();
      ctx.restore();
    }
  }

  drawSprayBay(ctx, s) {
    ctx.save();
    ctx.translate(s.x, s.y);
    // bay floor
    ctx.fillStyle = '#1d2129';
    ctx.fillRect(-30, -22, 60, 44);
    ctx.strokeStyle = '#e0b23d';
    ctx.lineWidth = 2;
    ctx.strokeRect(-28, -20, 56, 40);
    // door
    ctx.fillStyle = '#2a2f3a';
    ctx.fillRect(-24, -18, 48, 12);
    ctx.fillStyle = '#171a21';
    for (let i = 0; i < 4; i++) ctx.fillRect(-24, -18 + i * 3, 48, 1.5);
    // sign
    ctx.font = 'bold 9px "Courier New", monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#e0b23d';
    ctx.fillText('SPRAY', 0, 14);
    ctx.restore();
  }

  // ----------------------------------------------------------------- cars

  drawCars(ctx, view) {
    const game = this.game;
    // headlight cones first (under the bodies, over the road)
    ctx.globalCompositeOperation = 'lighter';
    for (const c of game.cars) {
      if (c.dead || !c.headlights || c.exploded) continue;
      if (c.x < view.x0 - 200 || c.x > view.x1 + 200 || c.y < view.y0 - 200 || c.y > view.y1 + 200) continue;
      this.headlightCone(ctx, c);
    }
    ctx.globalCompositeOperation = 'source-over';
    for (const c of game.cars) {
      if (c.x < view.x0 - 120 || c.x > view.x1 + 120 || c.y < view.y0 - 120 || c.y > view.y1 + 120) continue;
      this.drawCar(ctx, c);
    }
  }

  headlightCone(ctx, c) {
    const fx = Math.cos(c.ang), fy = Math.sin(c.ang);
    const ox = -fy, oy = fx;
    for (const s of [-0.32, 0.32]) {
      const px = c.x + fx * c.spec.w * 0.5 + ox * s * c.spec.h;
      const py = c.y + fy * c.spec.w * 0.5 + oy * s * c.spec.h;
      const tx = px + fx * 150, ty = py + fy * 150;
      const grad = ctx.createLinearGradient(px, py, tx, ty);
      grad.addColorStop(0, N.headlight);
      grad.addColorStop(1, 'rgba(255,238,170,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(px + ox * 4, py + oy * 4);
      ctx.lineTo(tx + ox * 34, ty + oy * 34);
      ctx.lineTo(tx - ox * 34, ty - oy * 34);
      ctx.lineTo(px - ox * 4, py - oy * 4);
      ctx.closePath();
      ctx.fill();
    }
  }

  drawCar(ctx, c) {
    const spec = c.spec;
    ctx.save();
    ctx.translate(c.x, c.y);
    // shadow
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.save();
    ctx.rotate(c.ang);
    ctx.fillRect(-spec.w / 2 + 3, -spec.h / 2 + 4, spec.w, spec.h);
    ctx.restore();
    ctx.rotate(c.ang);
    const hw = spec.w / 2, hh = spec.h / 2;

    if (c.exploded) {
      // burnt hull
      ctx.fillStyle = '#141416';
      roundRect(ctx, -hw, -hh, spec.w, spec.h, 4);
      ctx.fill();
      ctx.fillStyle = '#2a241c';
      ctx.fillRect(-hw * 0.4, -hh * 0.6, hw * 0.7, hh * 1.2);
      ctx.restore();
      return;
    }

    // body
    let bodyCol = c.color;
    if (c.hitFlash > 0) bodyCol = mixColor(c.color, '#ffffff', clamp(c.hitFlash, 0, 1) * 0.7);
    ctx.fillStyle = bodyCol;
    roundRect(ctx, -hw, -hh, spec.w, spec.h, spec.kind === 'bus' ? 3 : 5);
    ctx.fill();
    // trim line
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 1;
    roundRect(ctx, -hw + 1, -hh + 1, spec.w - 2, spec.h - 2, 4);
    ctx.stroke();

    // hood shading
    ctx.fillStyle = 'rgba(255,255,255,0.10)';
    ctx.fillRect(hw - 10, -hh + 2, 7, spec.h - 4);

    // cabin
    const cabinW = spec.w * (spec.kind === 'bus' ? 0.62 : 0.42);
    ctx.fillStyle = 'rgba(12,14,20,0.9)';
    roundRect(ctx, -hw + spec.w * 0.18, -hh + 3.5, cabinW, spec.h - 7, 3);
    ctx.fill();
    // windshield glint
    ctx.fillStyle = 'rgba(140,190,255,0.30)';
    ctx.fillRect(-hw + spec.w * 0.18 + cabinW - 5, -hh + 4, 3, spec.h - 8);

    // type details
    if (spec.kind === 'taxi') {
      ctx.fillStyle = '#16181d';
      ctx.fillRect(-hw + 4, -3, spec.w - 8, 6);
      ctx.fillStyle = c.color;
      for (let i = 0; i < 6; i++) ctx.fillRect(-hw + 5 + i * ((spec.w - 10) / 6), -2, 3, 4);
      // roof light
      ctx.fillStyle = Math.sin(c.lightT * 6) > 0 ? '#ffd23d' : '#3a3520';
      ctx.fillRect(-2, -4, 5, 8);
    }
    if (spec.kind === 'police') {
      ctx.fillStyle = '#e8eaf0';
      ctx.fillRect(-6, -hh + 1, 12, spec.h - 2);
      // light bar
      const t = c.lightT * 8;
      ctx.fillStyle = Math.sin(t) > 0 ? '#ff4040' : '#501010';
      ctx.fillRect(-3, -hh + 2, 4, 4);
      ctx.fillStyle = Math.sin(t + Math.PI) > 0 ? '#4090ff' : '#102050';
      ctx.fillRect(-3, hh - 6, 4, 4);
      ctx.fillStyle = '#e8eaf0';
      ctx.font = 'bold 4px monospace';
    }
    if (spec.kind === 'pickup') {
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.fillRect(-hw + 3, -hh + 3, spec.w * 0.3, spec.h - 6);
    }
    if (spec.kind === 'van' || spec.kind === 'truck') {
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.fillRect(-hw + 4, -hh + 4, spec.w - 8, 3);
    }

    // wheels (visible at the sides while turning)
    ctx.fillStyle = '#0c0d10';
    const wx = spec.w * 0.30;
    const wy = hh - 1;
    ctx.save();
    ctx.translate(wx, -wy); ctx.rotate(c.steerVis); ctx.fillRect(-3.5, -1.5, 7, 3); ctx.restore();
    ctx.save();
    ctx.translate(wx, wy); ctx.rotate(c.steerVis); ctx.fillRect(-3.5, -1.5, 7, 3); ctx.restore();
    ctx.save();
    ctx.translate(-wx, -wy); ctx.fillRect(-3.5, -1.5, 7, 3); ctx.restore();
    ctx.save();
    ctx.translate(-wx, wy); ctx.fillRect(-3.5, -1.5, 7, 3); ctx.restore();

    // headlights + taillights (+ reverse lights when backing up)
    if (c.headlights) {
      ctx.fillStyle = '#fff3c4';
      ctx.fillRect(hw - 2, -hh + 2, 2, 4);
      ctx.fillRect(hw - 2, hh - 6, 2, 4);
    }
    if (c.speed < -4) {
      ctx.fillStyle = 'rgba(240, 240, 220, 0.85)';
      ctx.fillRect(-hw + 0.5, -hh + 3, 1.4, 3);
      ctx.fillRect(-hw + 0.5, hh - 6, 1.4, 3);
    } else {
      ctx.fillStyle = N.taillight;
      ctx.fillRect(-hw, -hh + 2, 2, 3);
      ctx.fillRect(-hw, hh - 5, 2, 3);
    }

    // damage dents
    if (c.hp < spec.hp * 0.55) {
      ctx.fillStyle = 'rgba(10,10,12,0.5)';
      const dents = 3;
      for (let i = 0; i < dents; i++) {
        const dx = ((c.id * 37 + i * 91) % (spec.w - 8)) - spec.w / 2 + 4;
        const dy = ((c.id * 53 + i * 71) % (spec.h - 6)) - spec.h / 2 + 3;
        ctx.fillRect(dx, dy, 5, 4);
      }
    }
    ctx.restore();
  }

  /** Boats ride on top of the water, always above cars. */
  drawBoats(ctx, view) {
    const game = this.game;
    for (const b of game.boats) {
      if (b.x < view.x0 - 120 || b.x > view.x1 + 120 || b.y < view.y0 - 120 || b.y > view.y1 + 120) continue;
      this.drawBoat(ctx, b);
    }
  }

  drawBoat(ctx, b) {
    const spec = b.spec;
    const bobY = Math.sin(b.bob) * 1.6;
    ctx.save();
    ctx.translate(b.x, b.y + bobY);
    // shadow under the hull
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.save();
    ctx.rotate(b.ang);
    ctx.fillRect(-spec.w / 2 + 4, -spec.h / 2 + 5, spec.w, spec.h);
    ctx.restore();
    ctx.rotate(b.ang);
    const hw = spec.w / 2, hh = spec.h / 2;
    if (b.exploded) {
      ctx.fillStyle = '#141416';
      ctx.fillRect(-hw, -hh, spec.w, spec.h);
      ctx.restore();
      return;
    }
    // hull: pointed bow, flat stern
    ctx.fillStyle = b.color;
    ctx.beginPath();
    ctx.moveTo(hw, 0);
    ctx.lineTo(hw * 0.25, -hh);
    ctx.lineTo(-hw, -hh * 0.8);
    ctx.lineTo(-hw, hh * 0.8);
    ctx.lineTo(hw * 0.25, hh);
    ctx.closePath();
    ctx.fill();
    // rub rail
    ctx.strokeStyle = 'rgba(0,0,0,0.4)';
    ctx.lineWidth = 1.4;
    ctx.stroke();
    // deck
    ctx.fillStyle = 'rgba(255,255,255,0.16)';
    ctx.fillRect(-hw * 0.7, -hh * 0.45, spec.w * 0.75, spec.h * 0.9 * 0.45);
    // windshield + cabin
    ctx.fillStyle = 'rgba(12,14,20,0.9)';
    ctx.fillRect(-hw * 0.15, -hh * 0.55, spec.w * 0.22, spec.h * 0.55);
    ctx.fillStyle = 'rgba(140,190,255,0.3)';
    ctx.fillRect(hw * 0.05, -hh * 0.5, 3, spec.h * 0.5);
    // driver
    if (b.driver === 'player') {
      ctx.fillStyle = '#3ec6b8';
      ctx.beginPath();
      ctx.arc(-hw * 0.3, 0, 3.4, 0, TAU);
      ctx.fill();
    }
    // stern light
    ctx.fillStyle = '#ffd23d';
    ctx.fillRect(-hw + 1, -2, 2, 4);
    ctx.restore();
  }

  // ----------------------------------------------------------------- peds

  drawPeds(ctx) {
    const game = this.game;
    for (const p of game.peds.list) {
      if (p.state === 'dead') this.drawPed(ctx, p, true);
      else this.drawPed(ctx, p, false);
    }
  }

  drawPed(ctx, p, dead) {
    ctx.save();
    ctx.translate(p.x, p.y);
    if (dead) {
      ctx.globalAlpha = clamp(1 - p.deadT / 24, 0.25, 1);
      ctx.rotate(p.ang + Math.PI / 2);
      ctx.fillStyle = p.shirt;
      ctx.fillRect(-3, -7, 6, 14);
      ctx.fillStyle = p.skin;
      ctx.beginPath(); ctx.arc(0, -9, 3.4, 0, TAU); ctx.fill();
      ctx.restore();
      return;
    }
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath(); ctx.ellipse(2, 3, 5, 3.4, 0, 0, TAU); ctx.fill();
    ctx.rotate(p.ang + Math.PI / 2);
    // feet (joggers run longer strides)
    const stride = p.style === 'jogger' ? 3.6 : 2.4;
    const step = Math.sin(p.state === 'flee' ? p.step * 2.4 : p.step) * stride;
    ctx.fillStyle = '#14161a';
    ctx.fillRect(-2.6, -1 + step, 2, 4);
    ctx.fillRect(0.6, -1 - step, 2, 4);
    // torso
    ctx.fillStyle = p.shirt;
    roundRect(ctx, -3.4, -4.5, 6.8, 9, 2.6);
    ctx.fill();
    // style accents
    if (p.style === 'suit') {
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.fillRect(-0.8, -3.4, 1.6, 5);
    } else if (p.style === 'beach') {
      ctx.fillStyle = p.pants;
      ctx.fillRect(-3.4, 1.5, 6.8, 3);
    }
    // arms when fleeing
    if (p.state === 'flee') {
      ctx.fillStyle = p.skin;
      ctx.fillRect(-5.2, -6, 1.8, 5);
      ctx.fillRect(3.4, -6, 1.8, 5);
    }
    // head
    ctx.fillStyle = p.skin;
    ctx.beginPath(); ctx.arc(0, -6, 3.2, 0, TAU); ctx.fill();
    if (p.style === 'beach') {
      // sunglasses
      ctx.fillStyle = '#101319';
      ctx.fillRect(-2.2, -7, 1.7, 1.1);
      ctx.fillRect(0.6, -7, 1.7, 1.1);
    } else {
      ctx.fillStyle = 'rgba(20,20,24,0.65)';
      ctx.beginPath(); ctx.arc(0, -7, 3.0, Math.PI, TAU); ctx.fill();
    }
    ctx.restore();
  }

  drawCops(ctx) {
    const game = this.game;
    for (const cop of game.police.cops) {
      ctx.save();
      ctx.translate(cop.x, cop.y);
      if (cop.state === 'dead') {
        ctx.globalAlpha = clamp(1 - cop.deadT / 15, 0.25, 1);
        ctx.rotate(cop.ang + Math.PI / 2);
        ctx.fillStyle = '#26324a';
        ctx.fillRect(-3, -7, 6, 14);
        ctx.restore();
        continue;
      }
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath(); ctx.ellipse(2, 3, 5, 3.4, 0, 0, TAU); ctx.fill();
      ctx.rotate(cop.ang + Math.PI / 2);
      const step = Math.sin(cop.walkPhase) * 2.4;
      ctx.fillStyle = '#101319';
      ctx.fillRect(-2.6, -1 + step, 2, 4);
      ctx.fillRect(0.6, -1 - step, 2, 4);
      ctx.fillStyle = '#26324a';
      roundRect(ctx, -3.6, -4.5, 7.2, 9, 2.6);
      ctx.fill();
      ctx.fillStyle = '#c9b44f';
      ctx.fillRect(-2, -2, 4, 1.4);
      ctx.fillStyle = '#d9ab84';
      ctx.beginPath(); ctx.arc(0, -6, 3.2, 0, TAU); ctx.fill();
      ctx.fillStyle = '#1d2740';
      ctx.beginPath(); ctx.arc(0, -7, 3.1, Math.PI, TAU); ctx.fill();
      ctx.restore();
    }
  }

  drawPlayer(ctx) {
    const game = this.game;
    const p = game.player;
    if (p.inCar) return; // the car drawing covers them
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath(); ctx.ellipse(2, 3, 6, 4, 0, 0, TAU); ctx.fill();
    ctx.rotate(p.ang + Math.PI / 2);
    const step = p.moving ? Math.sin(p.walkPhase) * 2.6 : 0;
    ctx.fillStyle = '#14161a';
    ctx.fillRect(-2.8, -1 + step, 2.2, 4.4);
    ctx.fillRect(0.6, -1 - step, 2.2, 4.4);
    // torso: teal shirt, the vice look
    ctx.fillStyle = '#3ec6b8';
    roundRect(ctx, -3.8, -5, 7.6, 10, 2.8);
    ctx.fill();
    // arms / weapon
    ctx.fillStyle = '#d9ab84';
    if (p.weapon === 1) {
      ctx.fillStyle = '#20242c';
      ctx.fillRect(2.2, -7.5, 6, 2.6); // pistol held out front
      ctx.fillStyle = '#d9ab84';
      ctx.fillRect(2.2, -6.2, 2, 2.2);
    } else if (p.punchT > CFG.PUNCH_COOLDOWN - 0.18) {
      ctx.fillRect(2.5, -8.5, 4, 3);
    } else {
      ctx.fillRect(-5, -6, 2, 4.4);
      ctx.fillRect(3, -6, 2, 4.4);
    }
    // head with dark hair
    ctx.fillStyle = '#e8c39c';
    ctx.beginPath(); ctx.arc(0, -6.4, 3.4, 0, TAU); ctx.fill();
    ctx.fillStyle = '#241a10';
    ctx.beginPath(); ctx.arc(0, -7.2, 3.2, Math.PI, TAU); ctx.fill();
    ctx.restore();
  }

  // -------------------------------------------------------------- bullets

  drawBullets(ctx) {
    const game = this.game;
    ctx.strokeStyle = '#ffe9a3';
    ctx.lineWidth = 1.6;
    for (const b of game.bullets) {
      const f = clamp(b.t / b.dur, 0, 1);
      const lx = b.dx / CFG.GUN_SPEED * 26;
      const ly = b.dy / CFG.GUN_SPEED * 26;
      ctx.globalAlpha = 1 - f * 0.4;
      ctx.beginPath();
      ctx.moveTo(b.x - lx, b.y - ly);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  // -------------------------------------------------------------- effects

  drawEffects(ctx) {
    const game = this.game;
    for (const e of game.effects) {
      const f = clamp(e.t / e.dur, 0, 1);
      switch (e.type) {
        case 'spark': {
          ctx.strokeStyle = '#ffd23d';
          ctx.lineWidth = 1.4;
          for (let i = 0; i < (e.n || 3); i++) {
            const a = (i / (e.n || 3)) * TAU + e.x;
            const l = 6 + f * 10;
            ctx.globalAlpha = 1 - f;
            ctx.beginPath();
            ctx.moveTo(e.x + Math.cos(a) * 3, e.y + Math.sin(a) * 3);
            ctx.lineTo(e.x + Math.cos(a) * l, e.y + Math.sin(a) * l);
            ctx.stroke();
          }
          ctx.globalAlpha = 1;
          break;
        }
        case 'blood': {
          ctx.fillStyle = `rgba(140, 20, 28, ${0.7 * (1 - f)})`;
          ctx.beginPath();
          ctx.ellipse(e.x, e.y, 6 + f * 10, 4 + f * 7, 0.3, 0, TAU);
          ctx.fill();
          break;
        }
        case 'muzzle': {
          ctx.save();
          ctx.translate(e.x, e.y);
          ctx.rotate(e.ang);
          ctx.fillStyle = `rgba(255, 230, 140, ${1 - f})`;
          ctx.beginPath();
          ctx.moveTo(0, 0); ctx.lineTo(10, -3); ctx.lineTo(14, 0); ctx.lineTo(10, 3);
          ctx.closePath(); ctx.fill();
          ctx.restore();
          break;
        }
        case 'flame': {
          const y = e.y - f * 18;
          ctx.fillStyle = `rgba(255, ${140 - f * 80}, 40, ${0.8 * (1 - f)})`;
          ctx.beginPath();
          ctx.arc(e.x, y, 4 + f * 5, 0, TAU);
          ctx.fill();
          break;
        }
        case 'smoke': {
          ctx.fillStyle = `rgba(70, 70, 76, ${0.4 * (1 - f)})`;
          ctx.beginPath();
          ctx.arc(e.x, e.y - f * 24, 5 + f * 12, 0, TAU);
          ctx.fill();
          break;
        }
        case 'splash': {
          const r = e.small ? 3 + f * 10 : 4 + f * 22;
          ctx.strokeStyle = `rgba(150, 210, 255, ${0.6 * (1 - f)})`;
          ctx.lineWidth = e.small ? 1.4 : 2;
          ctx.beginPath();
          ctx.arc(e.x, e.y, r, 0, TAU);
          ctx.stroke();
          break;
        }
        case 'hit': {
          ctx.fillStyle = `rgba(255,255,255,${0.8 * (1 - f)})`;
          ctx.beginPath();
          ctx.arc(e.x, e.y, 3 + f * 3, 0, TAU);
          ctx.fill();
          break;
        }
        case 'debris': {
          ctx.save();
          ctx.translate(e.x, e.y);
          ctx.rotate(e.spinT || 0);
          ctx.fillStyle = `rgba(30, 32, 38, ${1 - f})`;
          ctx.fillRect(-e.size / 2, -e.size / 2, e.size, e.size * 0.7);
          ctx.fillStyle = `rgba(255, 150, 60, ${(1 - f) * 0.5})`;
          ctx.fillRect(-e.size / 2, -e.size / 2, e.size * 0.4, e.size * 0.3);
          ctx.restore();
          break;
        }
        case 'jet': {
          // sheared hydrant: a wobbling plume of street water
          const h = 40 + Math.sin(this.t * 22 + e.x) * 8;
          ctx.strokeStyle = `rgba(150, 210, 255, ${0.7 * (1 - f * 0.7)})`;
          ctx.lineWidth = 3;
          for (let i = 0; i < 3; i++) {
            const sway = Math.sin(this.t * 14 + i * 2.1) * (4 + i * 3);
            ctx.beginPath();
            ctx.moveTo(e.x, e.y);
            ctx.quadraticCurveTo(e.x + sway, e.y - h * 0.5, e.x + sway * 1.8, e.y - h * (0.8 + i * 0.08));
            ctx.stroke();
          }
          ctx.fillStyle = `rgba(170, 220, 255, ${0.25 * (1 - f)})`;
          ctx.beginPath();
          ctx.ellipse(e.x, e.y + 4, 14 + f * 10, 5, 0, 0, TAU);
          ctx.fill();
          break;
        }
        case 'cash': {
          ctx.fillStyle = `rgba(120, 230, 130, ${1 - f})`;
          ctx.font = 'bold 11px monospace';
          ctx.fillText('$', e.x - 3, e.y - f * 16);
          break;
        }
        case 'boom': {
          // flash core
          if (f < 0.2) {
            ctx.fillStyle = `rgba(255,255,240,${1 - f / 0.2})`;
            ctx.beginPath();
            ctx.arc(e.x, e.y, 24 + f * 90, 0, TAU);
            ctx.fill();
          }
          // fireball
          const fb = clamp(f / 0.6, 0, 1);
          const grad = ctx.createRadialGradient(e.x, e.y, 2, e.x, e.y, 30 + fb * 55);
          grad.addColorStop(0, `rgba(255, 240, 180, ${0.9 * (1 - fb)})`);
          grad.addColorStop(0.5, `rgba(255, 120, 40, ${0.7 * (1 - fb)})`);
          grad.addColorStop(1, 'rgba(60, 20, 10, 0)');
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.arc(e.x, e.y, 30 + fb * 55, 0, TAU);
          ctx.fill();
          // shockwave ring
          if (f < 0.45) {
            ctx.strokeStyle = `rgba(255, 220, 160, ${0.7 * (1 - f / 0.45)})`;
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(e.x, e.y, 20 + f * 190, 0, TAU);
            ctx.stroke();
          }
          // smoke
          if (f > 0.4) {
            const s = (f - 0.4) / 0.6;
            ctx.fillStyle = `rgba(50, 50, 55, ${0.5 * (1 - s)})`;
            ctx.beginPath();
            ctx.arc(e.x, e.y - s * 30, 20 + s * 34, 0, TAU);
            ctx.fill();
          }
          break;
        }
      }
    }
  }

  // -------------------------------------------------------- flash/vignette

  drawFlash(ctx, W, H) {
    const game = this.game;
    const f = game.flash + (game.weather ? game.weather.flashBonus() : 0);
    if (f > 0.01) {
      ctx.fillStyle = `rgba(255, 240, 210, ${clamp(f, 0, 1) * 0.55})`;
      ctx.fillRect(0, 0, W, H);
    }
  }

  drawVignette(ctx, W, H) {
    const key = W + 'x' + H;
    if (this._vigKey !== key) {
      const grad = ctx.createRadialGradient(W / 2, H / 2, H * 0.42, W / 2, H / 2, H * 0.85);
      grad.addColorStop(0, 'rgba(0,0,0,0)');
      grad.addColorStop(1, 'rgba(0,0,0,0.42)');
      this._vig = grad;
      this._vigKey = key;
    }
    ctx.fillStyle = this._vig;
    ctx.fillRect(0, 0, W, H);
  }

  // -------------------------------------------------------------- minimap

  /** Paint the circular minimap for the HUD. */
  drawMiniMap(ctx, cx, cy, radius) {
    const game = this.game;
    const world = game.world;
    const p = game.player;
    const scale = radius * 2 / 1500; // world px -> minimap px

    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, TAU);
    ctx.clip();
    ctx.fillStyle = '#0a0c12';
    ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);
    // map image: 2 minimap px per tile, re-scaled so ~1500 world px fit across
    const imgScale = 2 / CFG.T;      // minimap px per world px
    const f = scale / imgScale;      // map-image px per world px
    const pMapX = (p.x / CFG.T) * 2, pMapY = (p.y / CFG.T) * 2;
    ctx.translate(cx, cy);
    ctx.scale(f, f);
    ctx.translate(-pMapX, -pMapY);
    ctx.drawImage(world.minimap, 0, 0);
    ctx.restore();

    // blips
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, TAU);
    ctx.clip();
    const toScreen = (wx, wy) => {
      const mx = (wx / CFG.T) * 2, my = (wy / CFG.T) * 2;
      return { x: cx + (mx - pMapX) * f, y: cy + (my - pMapY) * f };
    };
    // mission markers
    const pulse = 0.5 + 0.5 * Math.sin(game.time * 5);
    for (const m of game.missions.markers()) {
      const s = toScreen(m.pos.x, m.pos.y);
      ctx.fillStyle = m.kind === 'side' ? '#5cff8a' : m.kind === 'checkpoint' ? '#37f5ff' : '#ffd23d';
      ctx.beginPath();
      ctx.arc(s.x, s.y, 3 + pulse * 1.6, 0, TAU);
      ctx.fill();
    }
    // courier drop
    if (game.delivery && game.delivery.active) {
      const s = toScreen(game.delivery.active.drop.x, game.delivery.active.drop.y);
      ctx.fillStyle = '#5cff8a';
      ctx.beginPath();
      ctx.arc(s.x, s.y, 3 + pulse * 1.6, 0, TAU);
      ctx.fill();
    }
    // mission target cars
    for (const c of game.cars) {
      if (!c.missionTag || c.dead) continue;
      const s = toScreen(c.x, c.y);
      ctx.fillStyle = '#ff5c5c';
      ctx.fillRect(s.x - 2.4, s.y - 2.4, 4.8, 4.8);
    }
    // cops when wanted
    if (game.police.wanted > 0) {
      for (const c of game.cars) {
        if (c.driver !== 'cop' || c.dead) continue;
        const s = toScreen(c.x, c.y);
        ctx.fillStyle = '#5c9dff';
        ctx.beginPath(); ctx.arc(s.x, s.y, 2.6, 0, TAU); ctx.fill();
      }
    }
    // player arrow
    ctx.translate(cx, cy);
    ctx.rotate(p.ang);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(5.5, 0);
    ctx.lineTo(-4, -3.6);
    ctx.lineTo(-2, 0);
    ctx.lineTo(-4, 3.6);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // rim
    ctx.strokeStyle = 'rgba(255, 210, 90, 0.65)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, TAU);
    ctx.stroke();
  }
}

// ---------------------------------------------------------------- helpers

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function hexA(hex, a) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${a})`;
}

function mixColor(a, b, t) {
  const pa = [parseInt(a.slice(1, 3), 16), parseInt(a.slice(3, 5), 16), parseInt(a.slice(5, 7), 16)];
  const pb = [parseInt(b.slice(1, 3), 16), parseInt(b.slice(3, 5), 16), parseInt(b.slice(5, 7), 16)];
  const m = pa.map((v, i) => Math.round(v + (pb[i] - v) * t));
  return `rgb(${m[0]},${m[1]},${m[2]})`;
}
