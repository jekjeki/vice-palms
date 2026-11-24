// render.js — base pass (ground/roads/buildings), entity pass, glow pass
// (headlights, neon, sirens), particles, explosion flash/shake, minimap.

import { CFG, ctx, VERSION } from './config.js';
import { clamp, lerp, TAU, angLerp } from './util.js';
import { RE, RH, I_MIN, I_MAX, J_MIN, J_MAX, zoneAt, isWater } from './world.js';

const C = CFG.colors;
const SW = CFG.sidewalk;

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.g = canvas.getContext('2d');
    this.cam = { x: CFG.map / 2, y: CFG.map / 2, zoom: CFG.zoomFoot, shake: 0, shakeT: 0 };
    this.minimap = buildMinimap();
    this.time = 0;
    this.mouse = { x: 0, y: 0 };
  }

  // follow the player (or their car) with velocity look-ahead + shake
  updateCamera(dt, S) {
    const p = S.player;
    let tx = p.x, ty = p.y, tz = CFG.zoomFoot;
    if (p.inCar) {
      const car = p.inCar;
      tx += car.vx * CFG.camLead * 0.5;
      ty += car.vy * CFG.camLead * 0.5;
      const spd = car.speed;
      tz = spd > 330 ? CFG.zoomFast : CFG.zoomCar;
      if (spd > 260) {
        this.cam.shake = Math.max(this.cam.shake, (spd - 260) * 0.004);
      }
    }
    tx = clamp(tx, this.canvas.width / 2 / tz, CFG.map - this.canvas.width / 2 / tz);
    ty = clamp(ty, this.canvas.height / 2 / tz, CFG.map - this.canvas.height / 2 / tz);
    const f = Math.min(1, dt * 5.5);
    this.cam.x = lerp(this.cam.x, tx, f);
    this.cam.y = lerp(this.cam.y, ty, f);
    this.cam.zoom = lerp(this.cam.zoom, tz, Math.min(1, dt * 2.5));
    this.cam.shake = Math.max(0, this.cam.shake - dt * 3.5);
    this.time += dt;
  }

  shakeCam(amount) {
    this.cam.shake = Math.min(1.6, this.cam.shake + amount);
  }

  draw(S) {
    const g = this.g;
    const W = this.canvas.width, H = this.canvas.height;
    const cam = this.cam;
    g.save();
    g.fillStyle = C.water;
    g.fillRect(0, 0, W, H);

    // camera transform (+shake)
    let sx = 0, sy = 0;
    if (cam.shake > 0.01) {
      sx = (Math.random() - 0.5) * cam.shake * 22;
      sy = (Math.random() - 0.5) * cam.shake * 22;
    }
    g.translate(W / 2 + sx, H / 2 + sy);
    g.scale(cam.zoom, cam.zoom);
    g.translate(-cam.x, -cam.y);

    const viewW = W / cam.zoom, viewH = H / cam.zoom;
    const vx0 = cam.x - viewW / 2, vy0 = cam.y - viewH / 2;
    const vx1 = cam.x + viewW / 2, vy1 = cam.y + viewH / 2;
    const view = { x0: vx0, y0: vy0, x1: vx1, y1: vy1 };

    this.drawGround(S, view);
    this.drawProps(S, view);
    this.drawSkidmarks(S, view);
    this.drawMarkers(S);
    this.drawPickups(S, view);
    this.drawPeds(S, view);
    this.drawCars(S, view);
    this.drawPlayer(S);
    this.drawParticles(S, view);
    this.drawBuildings(S, view);        // buildings drawn over entities for depth
    this.drawHeli(S, view);
    this.drawGlow(S, view);
    g.restore();

    this.drawFlash(S);
    this.drawRain(S);
    this.drawVignette();
    // expose camera to input for world mouse
    const inp = ctx.game && ctx.game.input;
    if (inp) inp.updateWorldMouse(cam);
  }

  // ------------------------------------------------------------- ground ---
  drawGround(S, view) {
    const g = this.g;
    const w = ctx.world;
    const m = CFG.map;

    // sand base over land south of beachTop
    if (view.y1 > CFG.beachTop) {
      g.fillStyle = C.sand;
      g.fillRect(Math.max(view.x0, 0), Math.max(view.y0, CFG.beachTop),
        Math.min(view.x1, m) - Math.max(view.x0, 0),
        Math.min(view.y1, m) - Math.max(view.y0, CFG.beachTop));
    }

    // park grass
    const p = CFG.park;
    if (view.x1 > p.x0 && view.x0 < p.x1 && view.y1 > p.y0 && view.y0 < p.y1) {
      g.fillStyle = C.grass;
      g.fillRect(p.x0, p.y0, p.x1 - p.x0, p.y1 - p.y0);
      // pond
      for (const pr of w.props) {
        if (pr.type !== 'pond') continue;
        g.fillStyle = '#123a52';
        g.beginPath();
        g.ellipse(pr.x, pr.y, pr.rx, pr.ry, 0, 0, TAU);
        g.fill();
        g.fillStyle = '#1a4a66';
        g.beginPath();
        g.ellipse(pr.x, pr.y, pr.rx * 0.8, pr.ry * 0.75, 0, 0, TAU);
        g.fill();
      }
    }

    // airfield ground: darker tarmac lots
    const a = CFG.airfield;
    if (view.x1 > a.x0 && view.x0 < a.x1 && view.y1 > a.y0 && view.y0 < a.y1) {
      g.fillStyle = '#20222a';
      g.fillRect(Math.max(view.x0, a.x0), Math.max(view.y0, a.y0),
        Math.min(view.x1, a.x1) - Math.max(view.x0, a.x0),
        Math.min(view.y1, a.y1) - Math.max(view.y0, a.y0));
      // runway + taxiway paint
      for (const pr of w.props) {
        if (pr.type !== 'runway' && pr.type !== 'taxiway') continue;
        const r = pr.rect;
        g.fillStyle = '#171920';
        g.fillRect(r.x0, r.y0, r.x1 - r.x0, r.y1 - r.y0);
        g.strokeStyle = '#d8d8d8';
        g.lineWidth = 3;
        g.setLineDash(pr.type === 'runway' ? [46, 30] : [18, 24]);
        g.beginPath();
        g.moveTo(r.x0 + 20, (r.y0 + r.y1) / 2);
        g.lineTo(r.x1 - 20, (r.y0 + r.y1) / 2);
        g.stroke();
        g.setLineDash([]);
      }
    }

    // block interiors (lot color) + sidewalks
    const bi0 = Math.max(0, Math.floor(view.x0 / RE)), bi1 = Math.min(7, Math.floor(view.x1 / RE));
    const bj0 = Math.max(0, Math.floor(view.y0 / RE)), bj1 = Math.min(7, Math.floor(view.y1 / RE));
    for (let bi = bi0; bi <= bi1; bi++) {
      for (let bj = bj0; bj <= bj1; bj++) {
        const cx = bi * RE + RE / 2, cy = bj * RE + RE / 2;
        const z = zoneAt(cx, cy);
        if (z === 'water') continue;
        const ix0 = bi * RE + RH, iy0 = bj * RE + RH;
        const iw = RE - RH * 2, ih = RE - RH * 2;
        if (z === 'beach') continue;
        g.fillStyle = C.sidewalk;
        g.fillRect(ix0, iy0, iw, ih);
        g.fillStyle = z === 'docks' ? '#22252d' : C.lot;
        g.fillRect(ix0 + SW, iy0 + SW, iw - SW * 2, ih - SW * 2);
      }
    }

    // roads: vertical strips then horizontal
    g.fillStyle = C.asphalt;
    for (let i = I_MIN; i <= I_MAX; i++) {
      const x = i * RE;
      if (x + RH < view.x0 || x - RH > view.x1) continue;
      const y0 = Math.max(view.y0, CFG.waterTop), y1 = Math.min(view.y1, CFG.waterBottom);
      if (y1 > y0) g.fillRect(x - RH, y0, RH * 2, y1 - y0);
    }
    for (let j = J_MIN; j <= J_MAX; j++) {
      const y = j * RE;
      if (y + RH < view.y0 || y - RH > view.y1) continue;
      g.fillRect(Math.max(view.x0, 0), y - RH, Math.min(view.x1, m) - Math.max(view.x0, 0), RH * 2);
    }

    // lane markings: dashed centerlines
    g.strokeStyle = C.line;
    g.lineWidth = 2.4;
    g.setLineDash([26, 30]);
    g.beginPath();
    for (let i = I_MIN; i <= I_MAX; i++) {
      const x = i * RE;
      if (x < view.x0 - 60 || x > view.x1 + 60) continue;
      const y0 = Math.max(view.y0, CFG.waterTop), y1 = Math.min(view.y1, CFG.waterBottom);
      if (y1 > y0) { g.moveTo(x, y0); g.lineTo(x, y1); }
    }
    for (let j = J_MIN; j <= J_MAX; j++) {
      const y = j * RE;
      if (y < view.y0 - 60 || y > view.y1 + 60) continue;
      g.moveTo(Math.max(view.x0, 0), y);
      g.lineTo(Math.min(view.x1, m), y);
    }
    g.stroke();
    g.setLineDash([]);

    // intersection detail + stop lines
    g.strokeStyle = 'rgba(220,225,235,0.5)';
    g.lineWidth = 3;
    for (let i = I_MIN; i <= I_MAX; i++) {
      for (let j = J_MIN; j <= J_MAX; j++) {
        const x = i * RE, y = j * RE;
        if (x < view.x0 - 100 || x > view.x1 + 100 || y < view.y0 - 100 || y > view.y1 + 100) continue;
        if (y < CFG.waterTop || y > CFG.waterBottom) continue;
        g.strokeRect(x - RH + 8, y - RH + 8, RH * 2 - 16, RH * 2 - 16);
      }
    }

    // wet sheen: subtle diagonal light streaks on roads near cam
    const wet = ctx.weather ? 1 + ctx.weather.wetness() * 1.6 : 1;
    g.globalAlpha = Math.min(0.16, 0.05 * wet);
    g.fillStyle = '#9ab8ff';
    const step = 240;
    const gx0 = Math.floor(view.x0 / step) * step;
    for (let x = gx0; x < view.x1; x += step) {
      g.fillRect(x, Math.max(view.y0, CFG.waterTop), 60, Math.min(view.y1, CFG.waterBottom) - Math.max(view.y0, CFG.waterTop));
    }
    g.globalAlpha = 1;

    // billboards: neon ads with glow + rendered text
    for (const bb of w.billboards) {
      if (bb.x < view.x0 - 220 || bb.x > view.x1 + 220 || bb.y < view.y0 - 100 || bb.y > view.y1 + 100) continue;
      const bw = bb.bw, bh = 34;
      g.fillStyle = '#101218';
      g.fillRect(bb.x - bw / 2, bb.y - bh / 2, bw, bh);
      g.strokeStyle = bb.color;
      g.lineWidth = 2;
      g.strokeRect(bb.x - bw / 2 + 2, bb.y - bh / 2 + 2, bw - 4, bh - 4);
      g.fillStyle = bb.color;
      g.font = 'bold 15px "Arial Black", sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(bb.text, bb.x, bb.y + 1);
      g.textBaseline = 'alphabetic';
      // support posts
      g.fillStyle = '#26282e';
      g.fillRect(bb.x - 8, bb.y - (bb.y < bb.y + 1 ? 6 : 6), 5, 8);
    }

    // ocean shimmer
    g.strokeStyle = 'rgba(120,190,230,0.12)';
    g.lineWidth = 2;
    const shY0 = Math.max(view.y0, 0), shY1 = Math.min(view.y1, CFG.waterTop);
    if (shY1 > shY0) {
      g.beginPath();
      for (let y = shY0 - (shY0 % 46) + 46; y < shY1; y += 46) {
        for (let x = Math.floor(view.x0 / 90) * 90; x < view.x1; x += 90) {
          g.moveTo(x, y);
          g.lineTo(x + 44, y);
        }
      }
      g.stroke();
    }
    const shY0b = Math.max(view.y0, CFG.waterBottom), shY1b = Math.min(view.y1, CFG.map);
    if (shY1b > shY0b) {
      g.beginPath();
      for (let y = shY0b - (shY0b % 46) + 46; y < shY1b; y += 46) {
        for (let x = Math.floor(view.x0 / 90) * 90; x < view.x1; x += 90) {
          g.moveTo(x, y);
          g.lineTo(x + 44, y);
        }
      }
      g.stroke();
    }
  }

  // -------------------------------------------------------------- props ---
  drawProps(S, view) {
    const g = this.g;
    const w = ctx.world;

    // piers
    for (const p of w.piers) {
      if (p.x1 < view.x0 || p.x0 > view.x1) continue;
      g.fillStyle = '#4a4034';
      g.fillRect(p.x0, p.y0, p.x1 - p.x0, p.y1 - p.y0);
      g.strokeStyle = 'rgba(0,0,0,0.25)';
      g.lineWidth = 2;
      for (let x = p.x0 + 30; x < p.x1; x += 60) {
        g.beginPath(); g.moveTo(x, p.y0); g.lineTo(x, p.y1); g.stroke();
      }
    }

    for (const pr of w.props) {
      if (pr.x < view.x0 - 200 || pr.x > view.x1 + 200 || pr.y < view.y0 - 200 || pr.y > view.y1 + 200) continue;
      switch (pr.type) {
        case 'container': {
          for (let s = 0; s < pr.stack; s++) {
            const off = s * 2.5;
            g.save();
            g.translate(pr.x, pr.y - off);
            g.rotate(pr.a);
            g.fillStyle = pr.color;
            g.globalAlpha = 0.92 - s * 0.18;
            g.fillRect(-pr.w / 2, -pr.h / 2, pr.w, pr.h);
            g.strokeStyle = 'rgba(0,0,0,0.4)';
            g.strokeRect(-pr.w / 2, -pr.h / 2, pr.w, pr.h);
            g.restore();
          }
          g.globalAlpha = 1;
          break;
        }
        case 'crane': {
          g.fillStyle = '#b08a2a';
          g.fillRect(pr.x - 14, 250, 28, 240);         // legs area
          g.fillRect(pr.x - 90, 250, 180, 20);         // beam
          g.strokeStyle = '#d8a83a';
          g.strokeRect(pr.x - 90, 250, 180, 20);
          g.fillStyle = '#8a6a1a';
          g.fillRect(pr.x - 8, 270, 16, 30);           // trolley
          break;
        }
        case 'ship': {
          g.fillStyle = '#1c2430';
          g.beginPath();
          g.moveTo(pr.x - 300, pr.y);
          g.lineTo(pr.x + 300, pr.y);
          g.lineTo(pr.x + 250, pr.y + 110);
          g.lineTo(pr.x - 250, pr.y + 110);
          g.closePath();
          g.fill();
          g.fillStyle = '#2a3442';
          g.fillRect(pr.x - 220, pr.y + 18, 440, 34);
          g.fillStyle = '#c2453f';
          g.fillRect(pr.x - 60, pr.y + 40, 50, 60);    // bridge tower
          g.fillStyle = '#e8d8a0';
          for (let i = 0; i < 5; i++) g.fillRect(pr.x - 180 + i * 80, pr.y + 26, 12, 8);
          break;
        }
        case 'crate': {
          g.fillStyle = '#7a5a34';
          g.fillRect(pr.rect.x0, pr.rect.y0, pr.rect.x1 - pr.rect.x0, pr.rect.y1 - pr.rect.y0);
          g.strokeStyle = '#4a3a20';
          g.strokeRect(pr.rect.x0 + 3, pr.rect.y0 + 3, pr.rect.x1 - pr.rect.x0 - 6, pr.rect.y1 - pr.rect.y0 - 6);
          break;
        }
        case 'palm': case 'tree': {
          // trunk shadow only here; canopy drawn in glow pass for depth
          g.fillStyle = C.palmTrunk;
          g.beginPath();
          g.arc(pr.x, pr.y, 5, 0, TAU);
          g.fill();
          break;
        }
        case 'umbrella': {
          g.fillStyle = '#e05a5a';
          g.beginPath(); g.arc(pr.x, pr.y, 16, 0, TAU); g.fill();
          g.fillStyle = '#f0f0e0';
          g.beginPath(); g.arc(pr.x, pr.y, 16, 0.4, 1.8); g.lineTo(pr.x, pr.y); g.fill();
          break;
        }
        case 'bench': {
          g.fillStyle = '#5a4630';
          g.fillRect(pr.x - 26, pr.y - 7, 52, 14);
          break;
        }
        case 'phonebooth': {
          g.fillStyle = '#2a4a8a';
          g.fillRect(pr.rect.x0, pr.rect.y0, pr.rect.x1 - pr.rect.x0, pr.rect.y1 - pr.rect.y0);
          g.fillStyle = '#bfe0ff';
          g.fillRect(pr.rect.x0 + 2, pr.rect.y0 + 3, pr.rect.x1 - pr.rect.x0 - 4, 8);
          break;
        }
        case 'dumpster': {
          g.save();
          g.translate(pr.x, pr.y);
          g.rotate(pr.a);
          g.fillStyle = '#2f5a3a';
          g.fillRect(-26, -14, 52, 28);
          g.fillStyle = '#244a2e';
          g.fillRect(-26, -14, 52, 9);
          g.strokeStyle = 'rgba(0,0,0,0.4)';
          g.strokeRect(-26, -14, 52, 28);
          g.restore();
          break;
        }
        case 'fountain': {
          g.fillStyle = '#3a4a58';
          g.beginPath(); g.arc(pr.x, pr.y, 42, 0, TAU); g.fill();
          g.fillStyle = '#4a7a9a';
          g.beginPath(); g.arc(pr.x, pr.y, 32, 0, TAU); g.fill();
          break;
        }
        case 'hut': {
          g.fillStyle = '#c85a3a';
          g.fillRect(pr.rect.x0, pr.rect.y0, pr.rect.x1 - pr.rect.x0, pr.rect.y1 - pr.rect.y0);
          g.fillStyle = '#e8e0d0';
          g.fillRect(pr.rect.x0 + 4, pr.rect.y0 + 4, pr.rect.x1 - pr.rect.x0 - 8, 10);
          break;
        }
        case 'plane': {
          g.save();
          g.translate(pr.x, pr.y);
          g.rotate(pr.a);
          g.fillStyle = '#c8ccd4';
          g.fillRect(-90, -10, 180, 20);
          g.fillRect(-14, -70, 28, 140);
          g.fillStyle = '#2a6ac8';
          g.fillRect(50, -8, 34, 16);
          g.restore();
          break;
        }
        case 'windsock': {
          g.fillStyle = '#e06a2a';
          g.fillRect(pr.x, pr.y, 40, 8);
          break;
        }
      }
    }
  }

  // ---------------------------------------------------------- buildings ---
  drawBuildings(S, view) {
    const g = this.g;
    const w = ctx.world;
    const bi0 = Math.max(0, Math.floor(view.x0 / RE) - 1), bi1 = Math.min(7, Math.floor(view.x1 / RE) + 1);
    const bj0 = Math.max(0, Math.floor(view.y0 / RE) - 1), bj1 = Math.min(7, Math.floor(view.y1 / RE) + 1);
    for (let bi = bi0; bi <= bi1; bi++) {
      for (let bj = bj0; bj <= bj1; bj++) {
        const list = w.blockBuildings.get(bi + ',' + bj);
        if (!list) continue;
        for (const b of list) this.drawBuilding(g, b);
      }
    }
  }

  drawBuilding(g, b) {
    const bw = b.x1 - b.x0, bh = b.y1 - b.y0;
    // drop shadow
    g.fillStyle = 'rgba(0,0,0,0.45)';
    g.fillRect(b.x0 + 5, b.y0 + 7, bw, bh);
    // body
    g.fillStyle = b.zone === 'downtown' ? C.building : (b.h >= 3 ? C.building : C.building2);
    g.fillRect(b.x0, b.y0, bw, bh);
    // roof inset
    g.fillStyle = b.tower ? '#2c3040' : C.roof;
    g.fillRect(b.x0 + 6, b.y0 + 6, bw - 12, bh - 12);
    // roof details
    if (b.h >= 6) {
      g.fillStyle = '#323848';
      g.fillRect(b.x0 + bw * 0.3, b.y0 + bh * 0.3, bw * 0.2, bh * 0.2);
      // antenna
      g.strokeStyle = '#5a6070';
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(b.x0 + bw / 2, b.y0 + bh / 2);
      g.lineTo(b.x0 + bw / 2, b.y0 + bh / 2 - 14);
      g.stroke();
      g.fillStyle = '#ff4040';
      g.fillRect(b.x0 + bw / 2 - 2, b.y0 + bh / 2 - 17, 4, 4);
    }
    if (b.hangar) {
      g.strokeStyle = '#565e6e';
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(b.x0 + 10, b.y1 - 12);
      g.quadraticCurveTo(b.x0 + bw / 2, b.y0 - 30, b.x1 - 10, b.y1 - 12);
      g.stroke();
    }
    if (b.dock) {
      g.strokeStyle = '#3a4a5a';
      g.lineWidth = 2;
      for (let y = b.y0 + 20; y < b.y1 - 10; y += 22) {
        g.beginPath(); g.moveTo(b.x0 + 6, y); g.lineTo(b.x1 - 6, y); g.stroke();
      }
    }
    // neon trim (bright stroke; halo comes in glow pass)
    if (b.neon) {
      g.strokeStyle = b.neon;
      g.lineWidth = 2.6;
      g.strokeRect(b.x0 + 2, b.y0 + 2, bw - 4, bh - 4);
      if (b.trim) {
        g.globalAlpha = 0.65;
        g.strokeRect(b.x0 + 8, b.y0 + 8, bw - 16, bh - 16);
        g.globalAlpha = 1;
      }
    }
    // window grid (cheap: few rows of lit dots)
    const cols = Math.min(10, Math.max(2, (bw / 34) | 0));
    const rows = Math.min(8, Math.max(2, (bh / 34) | 0));
    g.fillStyle = '#ffd98a';
    for (let r = 0; r < rows; r++) {
      for (let cc = 0; cc < cols; cc++) {
        if ((r * 31 + cc * 17 + ((bw | 0) % 7)) % 3 === 0) continue;   // some dark
        const wx = b.x0 + 14 + cc * ((bw - 28) / Math.max(1, cols - 1));
        const wy = b.y0 + 14 + r * ((bh - 28) / Math.max(1, rows - 1));
        g.globalAlpha = 0.5 + ((r * 7 + cc * 13) % 5) * 0.09;
        g.fillRect(wx - 2, wy - 2, 4, 4);
      }
    }
    g.globalAlpha = 1;
  }

  // ---------------------------------------------------------- skidmarks ---
  drawSkidmarks(S, view) {
    const g = this.g;
    for (const s of S.skidmarks) {
      if (s.x < view.x0 - 20 || s.x > view.x1 + 20 || s.y < view.y0 - 20 || s.y > view.y1 + 20) continue;
      g.globalAlpha = Math.min(0.5, s.life / 5.5 * 0.5);
      g.strokeStyle = '#0c0d10';
      g.lineWidth = s.w;
      g.beginPath();
      g.moveTo(s.x - Math.cos(s.a) * 3, s.y - Math.sin(s.a) * 3);
      g.lineTo(s.x + Math.cos(s.a) * 3, s.y + Math.sin(s.a) * 3);
      g.stroke();
    }
    g.globalAlpha = 1;
  }

  // ------------------------------------------------------------- entities --
  drawPeds(S, view) {
    const g = this.g;
    for (const p of ctx.pedsList) {
      if (p.x < view.x0 - 40 || p.x > view.x1 + 40 || p.y < view.y0 - 40 || p.y > view.y1 + 40) continue;
      if (p.dead) {
        g.fillStyle = 'rgba(120,30,30,0.5)';
        g.beginPath(); g.ellipse(p.x, p.y, 14, 9, p.dir, 0, TAU); g.fill();
        g.globalAlpha = Math.max(0, 1 - p.deadT / 24);
        g.fillStyle = p.shirt;
        g.fillRect(p.x - 7, p.y - 4, 14, 8);
        g.globalAlpha = 1;
        continue;
      }
      const bob = Math.sin(p.animT * 9) * 1.6;
      g.fillStyle = 'rgba(0,0,0,0.4)';
      g.beginPath(); g.arc(p.x + 2, p.y + 3, 7, 0, TAU); g.fill();
      g.fillStyle = p.legs;
      g.fillRect(p.x - 3.4, p.y - 3, 6.8, 9);
      g.fillStyle = p.shirt;
      g.fillRect(p.x - 5, p.y - 6 + bob * 0.3, 10, 8);
      g.fillStyle = p.skin;
      g.beginPath(); g.arc(p.x, p.y - 7 + bob * 0.2, 4, 0, TAU); g.fill();
      if (p.kind === 'gang') {
        g.fillStyle = '#1a1a1a';
        g.fillRect(p.x + Math.cos(p.dir) * 8 - 1.6, p.y + Math.sin(p.dir) * 8 - 1.6, 3.2, 3.2);
      }
    }
  }

  drawCars(S, view) {
    const g = this.g;
    for (const car of ctx.cars) {
      if (car.x < view.x0 - 90 || car.x > view.x1 + 90 || car.y < view.y0 - 90 || car.y > view.y1 + 90) continue;
      if (car.dead && car.wreckT <= 0) continue;
      this.drawCar(g, car);
    }
  }

  drawCar(g, car) {
    const s = car.spec;
    g.save();
    g.translate(car.x, car.y);
    g.rotate(car.angle);

    const L = s.l, W = s.w;
    // shadow
    g.fillStyle = 'rgba(0,0,0,0.45)';
    rrect(g, -L / 2 + 3, -W / 2 + 4, L, W, 5); g.fill();

    if (car.dead) {
      // burnt husk
      g.fillStyle = '#141414';
      rrect(g, -L / 2, -W / 2, L, W, 5); g.fill();
      g.fillStyle = '#242424';
      rrect(g, -L / 2 + 6, -W / 2 + 4, L - 18, W - 8, 3); g.fill();
      g.restore();
      return;
    }

    // body
    g.fillStyle = car.color;
    rrect(g, -L / 2, -W / 2, L, W, 5); g.fill();
    // roof/cabin
    g.fillStyle = shade(car.color, -28);
    rrect(g, -L * 0.18, -W / 2 + 2.5, L * 0.42, W - 5, 3); g.fill();
    // windshield
    g.fillStyle = '#0e1620';
    rrect(g, L * 0.16, -W / 2 + 3, L * 0.14, W - 6, 2); g.fill();
    rrect(g, -L * 0.24, -W / 2 + 3, L * 0.08, W - 6, 2); g.fill();
    // type detail
    if (car.type === 'taxi') {
      g.fillStyle = '#1a1a1a';
      g.fillRect(-L * 0.05, -W / 2 - 2, 10, 4);
      g.fillStyle = '#e8b820';
      g.fillRect(-L * 0.05 + 2, -W / 2 - 2, 6, 3);
    }
    if (car.type === 'police') {
      g.fillStyle = '#e8e8f0';
      g.fillRect(-L / 2 + 4, -W / 2, L - 8, 3);
      g.fillRect(-L / 2 + 4, W / 2 - 3, L - 8, 3);
      // lightbar
      g.fillStyle = '#dc3040';
      g.fillRect(-3, -W / 2 - 1, 6, W + 2);
    }
    if (car.type === 'bus') {
      g.fillStyle = '#101820';
      for (let i = -2; i <= 2; i++) g.fillRect(i * 12 - 2, -W / 2 + 3, 4, W - 6);
    }
    if (car.type === 'limo') {
      g.fillStyle = '#0e1620';
      g.fillRect(-L * 0.3, -W / 2 + 3, L * 0.55, W - 6);
      g.fillStyle = car.color;
      g.fillRect(-L * 0.05, -W / 2 + 3, L * 0.22, W - 6);
    }
    // wheels
    g.fillStyle = '#0a0a0c';
    const wPos = L * 0.30, wOff = W / 2 + 1;
    for (const [dx, dy] of [[wPos, -wOff], [wPos, wOff], [-wPos, -wOff], [-wPos, wOff]]) {
      g.save();
      g.translate(dx, dy);
      if (dy < 0 || dy > 0) g.rotate((dx > 0 ? car.steerVis : 0));
      g.fillRect(-3.4, -2.4, 6.8, 4.8);
      g.restore();
    }
    // damage streaks
    if (car.hp < car.maxHp * 0.6) {
      g.fillStyle = 'rgba(20,20,20,0.55)';
      g.fillRect(-L / 2 + 4, -W / 2, 8, W);
    }
    g.restore();
  }

  drawPlayer(S) {
    const g = this.g;
    const p = S.player;
    if (p.inCar) return;      // hidden inside the car
    const bob = Math.sin(p.animT * (p.moving ? (p.sprinting ? 13 : 9) : 2)) * 1.6;
    g.fillStyle = 'rgba(0,0,0,0.45)';
    g.beginPath(); g.arc(p.x + 2, p.y + 3, 8, 0, TAU); g.fill();
    // legs
    g.fillStyle = '#26324a';
    g.fillRect(p.x - 3.6, p.y - 3, 7.2, 10);
    // jacket
    g.fillStyle = '#e8e4da';
    g.fillRect(p.x - 5.6, p.y - 6 + bob * 0.3, 11.2, 9);
    g.fillStyle = '#c86a8a';
    g.fillRect(p.x - 5.6, p.y - 2 + bob * 0.3, 11.2, 3);
    // head
    g.fillStyle = '#c8a080';
    g.beginPath(); g.arc(p.x, p.y - 7.5 + bob * 0.2, 4.4, 0, TAU); g.fill();
    g.fillStyle = '#20180f';
    g.beginPath(); g.arc(p.x, p.y - 9 + bob * 0.2, 3.4, Math.PI, TAU); g.fill();
    // gun arm toward aim
    g.strokeStyle = '#c8a080';
    g.lineWidth = 2.6;
    g.beginPath();
    g.moveTo(p.x + 2, p.y - 2);
    g.lineTo(p.x + Math.cos(p.angle) * 10, p.y + Math.sin(p.angle) * 10 - 2);
    g.stroke();
    if (p.ammo > 0) {
      g.fillStyle = '#101010';
      g.fillRect(p.x + Math.cos(p.angle) * 12 - 1.5, p.y + Math.sin(p.angle) * 12 - 3.5, 3, 6);
    }
    // aim line
    g.globalAlpha = 0.16;
    g.strokeStyle = '#ff6a8a';
    g.lineWidth = 1.4;
    g.setLineDash([8, 10]);
    g.beginPath();
    g.moveTo(p.x, p.y);
    g.lineTo(p.x + Math.cos(p.angle) * CFG.pistolRange, p.y + Math.sin(p.angle) * CFG.pistolRange);
    g.stroke();
    g.setLineDash([]);
    g.globalAlpha = 1;
  }

  // ------------------------------------------------------------ pickups ---
  drawPickups(S, view) {
    const g = this.g;
    for (const pk of ctx.world.pickups) {
      if (pk.taken > 0) continue;
      if (pk.x < view.x0 - 40 || pk.x > view.x1 + 40 || pk.y < view.y0 - 40 || pk.y > view.y1 + 40) continue;
      const t = (this.time * 3) % TAU;
      const pulse = 1 + Math.sin(t) * 0.15;
      const col = pk.type === 'health' ? '#4ae88a' : pk.type === 'armor' ? '#5aa0f0' : pk.type === 'ammo' ? '#f5c04a' : '#4ae8a0';
      g.save();
      g.translate(pk.x, pk.y);
      g.rotate(t * 0.7);
      g.fillStyle = col;
      g.globalAlpha = 0.9;
      g.fillRect(-8 * pulse, -8 * pulse, 16 * pulse, 16 * pulse);
      g.fillStyle = '#0a1410';
      g.font = 'bold 11px monospace';
      g.textAlign = 'center'; g.textBaseline = 'middle';
      const glyph = pk.type === 'health' ? '+' : pk.type === 'armor' ? 'A' : pk.type === 'ammo' ? '≡' : '$';
      g.fillText(glyph, 0, 1);
      g.restore();
      g.globalAlpha = 1;
    }
  }

  // ------------------------------------------------------------ markers ---
  drawMarkers(S) {
    const g = this.g;
    const t = this.time;
    const draw = (m, color) => {
      const pulse = 0.6 + Math.sin(t * 4) * 0.25;
      g.globalAlpha = 0.24 + pulse * 0.2;
      g.fillStyle = color;
      g.beginPath(); g.arc(m.x, m.y, 42, 0, TAU); g.fill();
      g.globalAlpha = 0.9;
      g.strokeStyle = color;
      g.lineWidth = 3;
      g.beginPath(); g.arc(m.x, m.y, 42, 0, TAU); g.stroke();
      g.globalAlpha = 1;
      // floating chevron
      const yy = m.y - 46 + Math.sin(t * 3) * 5;
      g.fillStyle = color;
      g.beginPath();
      g.moveTo(m.x - 10, yy); g.lineTo(m.x + 10, yy); g.lineTo(m.x, yy + 14);
      g.closePath(); g.fill();
    };
    if (S.mode === 'play' || S.mode === 'pause') {
      if (!S.missions.active) {
        for (const m of S.missions.giverMarkers()) draw(m, '#f5c04a');
      }
      for (const m of S.missions.objectiveMarkers()) draw(m, '#f05ec8');
    }
  }

  // ----------------------------------------------------------- particles --
  drawParticles(S, view) {
    const g = this.g;
    for (const f of S.fx) {
      if (f.x < view.x0 - 80 || f.x > view.x1 + 80 || f.y < view.y0 - 80 || f.y > view.y1 + 80) continue;
      const k = f.life / f.life0;
      switch (f.type) {
        case 'smoke': {
          g.globalAlpha = k * 0.4;
          g.fillStyle = '#565a62';
          const r = f.size * (2 - k);
          g.beginPath(); g.arc(f.x, f.y, r, 0, TAU); g.fill();
          break;
        }
        case 'fire': {
          g.globalAlpha = k;
          g.fillStyle = k > 0.5 ? '#ffb040' : '#ff5020';
          g.beginPath(); g.arc(f.x, f.y, f.size * k + 3, 0, TAU); g.fill();
          break;
        }
        case 'spark': {
          g.globalAlpha = k;
          g.fillStyle = '#ffd870';
          g.fillRect(f.x - 2, f.y - 2, 4, 4);
          break;
        }
        case 'blood': {
          g.globalAlpha = k * 0.7;
          g.fillStyle = '#a02030';
          g.beginPath(); g.arc(f.x, f.y, f.size * (1.6 - k), 0, TAU); g.fill();
          break;
        }
        case 'ring': {
          g.globalAlpha = k * 0.8;
          g.strokeStyle = '#ffd090';
          g.lineWidth = 4 * k + 1;
          g.beginPath(); g.arc(f.x, f.y, f.size * (1.8 - k * 1.4), 0, TAU); g.stroke();
          break;
        }
        case 'boom': {
          g.globalAlpha = k;
          const r = f.size * (2.2 - k * 1.6);
          const grd = g.createRadialGradient(f.x, f.y, 0, f.x, f.y, r);
          grd.addColorStop(0, '#fff0c0');
          grd.addColorStop(0.5, '#ff9030');
          grd.addColorStop(1, 'rgba(80,20,0,0)');
          g.fillStyle = grd;
          g.beginPath(); g.arc(f.x, f.y, r, 0, TAU); g.fill();
          break;
        }
        case 'muzzle': {
          g.globalAlpha = k;
          g.fillStyle = '#fff0b0';
          g.beginPath(); g.arc(f.x, f.y, f.size * k + 1, 0, TAU); g.fill();
          break;
        }
      }
      g.globalAlpha = 1;
    }
  }

  // ---------------------------------------------------------------- heli ---
  drawHeli(S, view) {
    const police = ctx.police;
    if (!police || !police.heli) return;
    const h = police.heli;
    if (h.x < view.x0 - 120 || h.x > view.x1 + 120 || h.y < view.y0 - 120 || h.y > view.y1 + 120) return;
    const g = this.g;
    // ground shadow offset (it flies)
    g.fillStyle = 'rgba(0,0,0,0.3)';
    g.beginPath(); g.ellipse(h.x + 26, h.y + 34, 26, 12, 0, 0, TAU); g.fill();
    // fuselage
    g.save();
    g.translate(h.x, h.y);
    g.rotate(h.dir);
    g.fillStyle = '#20283c';
    rrect(g, -18, -9, 44, 18, 7); g.fill();
    g.fillStyle = '#141b2c';
    rrect(g, 20, -4, 14, 8, 3); g.fill();
    g.fillStyle = '#0e1620';
    rrect(g, 6, -8, 10, 16, 3); g.fill();
    // tail
    g.fillStyle = '#20283c';
    g.fillRect(-34, -3, 20, 6);
    g.fillStyle = '#e8e8f0';
    g.fillRect(-34, -6, 4, 12);
    // rotor blur
    g.strokeStyle = 'rgba(200,215,240,0.5)';
    g.lineWidth = 2.4;
    for (let i = 0; i < 3; i++) {
      const a = h.rotor + (i * TAU) / 3;
      g.beginPath();
      g.moveTo(Math.cos(a) * 6, Math.sin(a) * 6);
      g.lineTo(Math.cos(a) * 34, Math.sin(a) * 34);
      g.stroke();
    }
    g.strokeStyle = 'rgba(200,215,240,0.22)';
    g.beginPath(); g.arc(0, 0, 34, 0, TAU); g.stroke();
    g.restore();
    // nav strobes
    const ph = (this.time * 3) % 1 < 0.5;
    g.fillStyle = ph ? '#ff4040' : '#4ae88a';
    g.fillRect(h.x - 33, h.y - 3, 3, 3);
    // searchlight cone down at the player
    g.globalCompositeOperation = 'lighter';
    const grd = g.createRadialGradient(h.x, h.y, 6, h.x, h.y, 190);
    grd.addColorStop(0, 'rgba(255,250,220,0.30)');
    grd.addColorStop(1, 'rgba(255,250,220,0)');
    g.fillStyle = grd;
    g.beginPath();
    g.arc(h.x, h.y, 190, 0, TAU);
    g.fill();
    g.globalCompositeOperation = 'source-over';
  }

  // ---------------------------------------------------------------- glow --
  drawGlow(S, view) {
    const g = this.g;
    g.globalCompositeOperation = 'lighter';

    // headlight cones
    for (const car of ctx.cars) {
      if (car.dead || !car.headlights) continue;
      if (car.x < view.x0 - 200 || car.x > view.x1 + 200 || car.y < view.y0 - 200 || car.y > view.y1 + 200) continue;
      const a = car.angle;
      const fx = car.x + Math.cos(a) * car.spec.l * 0.5;
      const fy = car.y + Math.sin(a) * car.spec.l * 0.5;
      const reach = 150;
      const spread = 0.42;
      const grd = g.createRadialGradient(fx, fy, 4, fx, fy, reach);
      grd.addColorStop(0, 'rgba(255,240,190,0.34)');
      grd.addColorStop(1, 'rgba(255,240,190,0)');
      g.fillStyle = grd;
      g.beginPath();
      g.moveTo(fx, fy);
      g.arc(fx, fy, reach, a - spread, a + spread);
      g.closePath();
      g.fill();
      // tail lights
      const bx = car.x - Math.cos(a) * car.spec.l * 0.48;
      const by = car.y - Math.sin(a) * car.spec.l * 0.48;
      g.fillStyle = 'rgba(255,60,50,0.55)';
      g.beginPath(); g.arc(bx, by, 3.4, 0, TAU); g.fill();
    }

    // neon halos on visible buildings
    const w = ctx.world;
    const bi0 = Math.max(0, Math.floor(view.x0 / RE) - 1), bi1 = Math.min(7, Math.floor(view.x1 / RE) + 1);
    const bj0 = Math.max(0, Math.floor(view.y0 / RE) - 1), bj1 = Math.min(7, Math.floor(view.y1 / RE) + 1);
    for (let bi = bi0; bi <= bi1; bi++) {
      for (let bj = bj0; bj <= bj1; bj++) {
        const list = w.blockBuildings.get(bi + ',' + bj);
        if (!list) continue;
        for (const b of list) {
          if (!b.neon) continue;
          const pulse = 0.5 + Math.sin(this.time * 2.2 + b.x0 * 0.01) * 0.16;
          const cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
          const r = Math.max(b.x1 - b.x0, b.y1 - b.y0) * 0.75;
          const grd = g.createRadialGradient(cx, cy, 0, cx, cy, r);
          grd.addColorStop(0, hexA(b.neon, 0.16 * pulse + 0.08));
          grd.addColorStop(1, hexA(b.neon, 0));
          g.fillStyle = grd;
          g.fillRect(cx - r, cy - r, r * 2, r * 2);
        }
      }
    }

    // palm/tree canopies (dark silhouettes catch a little light)
    for (const pr of w.props) {
      if ((pr.type !== 'palm' && pr.type !== 'tree') || !pr.big) continue;
      if (pr.x < view.x0 - 60 || pr.x > view.x1 + 60 || pr.y < view.y0 - 60 || pr.y > view.y1 + 60) continue;
      const sway = Math.sin(this.time * 1.4 + pr.x * 0.05) * 3;
      g.globalCompositeOperation = 'source-over';
      g.fillStyle = pr.type === 'palm' ? C.palmLeaf : '#245033';
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * TAU + pr.a;
        g.beginPath();
        g.ellipse(pr.x + Math.cos(a) * 13 + sway * 0.4, pr.y + Math.sin(a) * 8, 14, 4.5, a, 0, TAU);
        g.fill();
      }
      g.globalCompositeOperation = 'lighter';
    }

    // police strobes
    for (const car of ctx.cars) {
      if (car.ai !== 'police' || car.dead) continue;
      if (car.x < view.x0 - 150 || car.x > view.x1 + 150 || car.y < view.y0 - 150 || car.y > view.y1 + 150) continue;
      const ph = (this.time * 6) % 2 < 1;
      const col = ph ? 'rgba(255,60,60,0.5)' : 'rgba(60,90,255,0.5)';
      const grd = g.createRadialGradient(car.x, car.y, 2, car.x, car.y, 90);
      grd.addColorStop(0, col);
      grd.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grd;
      g.fillRect(car.x - 90, car.y - 90, 180, 180);
    }

    // billboard halos
    for (const bb of w.billboards) {
      if (bb.x < view.x0 - 260 || bb.x > view.x1 + 260 || bb.y < view.y0 - 140 || bb.y > view.y1 + 140) continue;
      const grd = g.createRadialGradient(bb.x, bb.y, 4, bb.x, bb.y, 110);
      grd.addColorStop(0, hexA(bb.color, 0.20));
      grd.addColorStop(1, hexA(bb.color, 0));
      g.fillStyle = grd;
      g.fillRect(bb.x - 110, bb.y - 110, 220, 220);
    }

    // streetlamp pools
    for (const lamp of w.lamps) {
      if (lamp.x < view.x0 - 100 || lamp.x > view.x1 + 100 || lamp.y < view.y0 - 100 || lamp.y > view.y1 + 100) continue;
      const grd = g.createRadialGradient(lamp.x, lamp.y, 2, lamp.x, lamp.y, 64);
      grd.addColorStop(0, 'rgba(255,220,150,0.14)');
      grd.addColorStop(1, 'rgba(255,220,150,0)');
      g.fillStyle = grd;
      g.fillRect(lamp.x - 64, lamp.y - 64, 128, 128);
    }

    // firefly particles glow (booms already bright)
    g.globalCompositeOperation = 'source-over';
  }

  // -------------------------------------------------------- flash/vignette --
  drawFlash(S) {
    const g = this.g;
    if (S.flash > 0.01) {
      g.fillStyle = `rgba(255,240,220,${Math.min(0.85, S.flash)})`;
      g.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }
    // lightning
    if (ctx.weather && ctx.weather.lightning > 0.02) {
      g.fillStyle = `rgba(225,235,255,${Math.min(0.5, ctx.weather.lightning * 0.45)})`;
      g.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }
    if (S.player && S.player.hurtT > 0) {
      g.fillStyle = `rgba(200,20,40,${S.player.hurtT * 0.5})`;
      g.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }
    // wanted pulse edges
    if (ctx.police && ctx.police.level > 0) {
      const a = 0.10 + Math.sin(this.time * 5) * 0.05;
      const grd = g.createLinearGradient(0, 0, 0, this.canvas.height);
      grd.addColorStop(0, `rgba(255,50,60,${a})`);
      grd.addColorStop(0.5, 'rgba(0,0,0,0)');
      grd.addColorStop(1, `rgba(255,50,60,${a})`);
      g.fillStyle = grd;
      g.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }
  }

  drawRain(S) {
    const w = ctx.weather;
    if (!w || w.rain < 0.04 || S.mode === 'title') return;
    const g = this.g;
    g.strokeStyle = `rgba(170,200,240,${0.16 + w.rain * 0.22})`;
    g.lineWidth = 1.1;
    g.beginPath();
    for (const d of w.drops) {
      g.moveTo(d.x, d.y);
      g.lineTo(d.x - d.len * 0.36, d.y - d.len);
    }
    g.stroke();
    // surface splash shimmer at the bottom of heavy rain
    if (w.rain > 0.5) {
      g.globalAlpha = 0.05 * (w.rain - 0.5) * 2;
      g.fillStyle = '#a8c8f0';
      for (let i = 0; i < 24; i++) {
        const x = (i * 173 + this.time * 90) % this.canvas.width;
        const y = this.canvas.height - ((i * 61 + this.time * 140) % 200);
        g.fillRect(x, y, 3, 2);
      }
      g.globalAlpha = 1;
    }
  }

  drawVignette() {
    const g = this.g;
    const W = this.canvas.width, H = this.canvas.height;
    const grd = g.createRadialGradient(W / 2, H / 2, H * 0.45, W / 2, H / 2, H * 0.95);
    grd.addColorStop(0, 'rgba(0,0,0,0)');
    grd.addColorStop(1, 'rgba(0,0,10,0.5)');
    g.fillStyle = grd;
    g.fillRect(0, 0, W, H);
  }
}

// ------------------------------------------------------------- helpers ----
function rrect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const r = clamp((n >> 16) + amt, 0, 255);
  const gg = clamp(((n >> 8) & 255) + amt, 0, 255);
  const b = clamp((n & 255) + amt, 0, 255);
  return `rgb(${r},${gg},${b})`;
}

function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
}

// --------------------------------------------------------- minimap base ---
function buildMinimap() {
  const c = document.createElement('canvas');
  c.width = 560; c.height = 560;
  const g = c.getContext('2d');
  const k = 560 / CFG.map;
  // water
  g.fillStyle = C.waterDeep;
  g.fillRect(0, 0, 560, 560);
  // land
  g.fillStyle = '#1c2030';
  g.fillRect(0, CFG.waterTop * k, 560, (CFG.waterBottom - CFG.waterTop) * k);
  // beach
  g.fillStyle = '#8a7448';
  g.fillRect(0, CFG.beachTop * k, 560, (CFG.waterBottom - CFG.beachTop) * k);
  // park
  g.fillStyle = '#1d3a26';
  g.fillRect(CFG.park.x0 * k, CFG.park.y0 * k, (CFG.park.x1 - CFG.park.x0) * k, (CFG.park.y1 - CFG.park.y0) * k);
  // airfield
  g.fillStyle = '#26282f';
  g.fillRect(CFG.airfield.x0 * k, CFG.airfield.y0 * k, (CFG.airfield.x1 - CFG.airfield.x0) * k, (CFG.airfield.y1 - CFG.airfield.y0) * k);
  // roads
  g.strokeStyle = '#4a4f60';
  g.lineWidth = 3;
  g.beginPath();
  for (let i = I_MIN; i <= I_MAX; i++) {
    g.moveTo(i * RE * k, CFG.waterTop * k);
    g.lineTo(i * RE * k, CFG.waterBottom * k);
  }
  for (let j = J_MIN; j <= J_MAX; j++) {
    g.moveTo(0, j * RE * k);
    g.lineTo(560, j * RE * k);
  }
  g.stroke();
  // buildings
  g.fillStyle = '#33384a';
  for (const b of ctx.world ? ctx.world.buildings : []) {
    g.fillRect(b.x0 * k, b.y0 * k, Math.max(1.5, (b.x1 - b.x0) * k), Math.max(1.5, (b.y1 - b.y0) * k));
  }
  return c;
}
