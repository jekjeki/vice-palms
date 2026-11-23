// render.js — Canvas 2D renderer: base world pass, buildings & props, entities,
// night darkness with light holes, neon/headlight glow, wet-road sheen,
// explosion flash/shake, circular minimap.
import { S, VW, VH, clamp, dist, hash2, TAU, ROAD_W } from './core.js';
import { VX, HY, world } from './world.js';
import { carCorners, carSpeed } from './cars.js';
import { markers } from './missions.js';

const CITY_X0 = 250, CITY_X1 = 5950, CITY_Y0 = 250, CITY_Y1 = 4182;
const ROAD_HALF = ROAD_W / 2;

let lightSprite = null, darkness = null, dctx = null;
function makeSprites() {
  if (lightSprite) return;
  lightSprite = document.createElement('canvas');
  lightSprite.width = lightSprite.height = 256;
  const lc = lightSprite.getContext('2d');
  const g = lc.createRadialGradient(128, 128, 0, 128, 128, 128);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.5, 'rgba(255,255,255,0.55)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  lc.fillStyle = g;
  lc.fillRect(0, 0, 256, 256);
  darkness = document.createElement('canvas');
  darkness.width = VW; darkness.height = VH;
  dctx = darkness.getContext('2d');
}

// ---------------------------------------------------------------- entry
export function render(ctx) {
  makeSprites();
  const c = S.cam, z = c.zoom;
  const shx = c.sx, shy = c.sy;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#12261a'; // beyond-world grass
  ctx.fillRect(0, 0, VW, VH);
  ctx.setTransform(z, 0, 0, z, VW / 2 - c.x * z + shx, VH / 2 - c.y * z + shy);
  const view = { x0: c.x - VW / 2 / z - 80, y0: c.y - VH / 2 / z - 80, x1: c.x + VW / 2 / z + 80, y1: c.y + VH / 2 / z + 80 };

  drawGround(ctx, view);
  drawRoads(ctx, view);
  drawProps(ctx, view);
  drawSkids(ctx, view);
  drawMarkers(ctx);
  drawBuildings(ctx, view);
  drawPalmsLamps(ctx, view);
  drawBodies(ctx);
  drawPickups(ctx, view);
  drawCars(ctx, view);
  drawPeople(ctx);
  drawBullets(ctx);
  drawParticles(ctx);
  drawExplosions(ctx);
  drawHeli(ctx, view);
  nightPass(ctx, view);
  glowPass(ctx, view);
  drawRain(ctx);
  screenFx(ctx);
}

// ---------------------------------------------------------------- ground
function drawGround(ctx, v) {
  const w = world;
  // base grass
  ctx.fillStyle = '#1a3324';
  ctx.fillRect(0, 0, 6400, 4800);
  // ocean south
  ctx.fillStyle = '#0c2440';
  ctx.fillRect(0, 4400, 6400, 400);
  waterWaves(ctx, 0, 4400, 6400, 400);
  // basin north
  ctx.fillStyle = '#0c2440';
  ctx.fillRect(0, 0, 1820, 260);
  waterWaves(ctx, 0, 0, 1820, 260);
  // sand
  ctx.fillStyle = '#c8b088';
  ctx.fillRect(0, 4182, 6400, 218);
  // park grass
  ctx.fillStyle = '#24512f';
  ctx.fillRect(1932, 2332, 736, 736);
  // docklands concrete
  ctx.fillStyle = '#3a3f46';
  ctx.fillRect(282, 282, 1616, 872);
  // airfield tarmac
  ctx.fillStyle = '#33363c';
  ctx.fillRect(4740, 240, 1440, 1230);
  // runway
  ctx.fillStyle = '#232529';
  ctx.fillRect(4740, 826, 1420, 84);
  runwayMarks(ctx);
  // city lawn base
  ctx.fillStyle = '#1e3a28';
  ctx.fillRect(250, 250, 5700, 3932);
}

function waterWaves(ctx, x, y, w, h) {
  ctx.strokeStyle = 'rgba(120,190,255,0.14)';
  ctx.lineWidth = 2;
  const t = S.time;
  for (let k = 0; k < 5; k++) {
    const yy = y + 22 + k * ((h - 40) / 5) + Math.sin(t * 1.4 + k) * 5;
    ctx.beginPath();
    for (let xx = x + 14; xx < x + w - 14; xx += 26) {
      const yo = Math.sin(xx / 40 + t * 2 + k * 1.7) * 3;
      if (xx === x + 14) ctx.moveTo(xx, yy + yo); else ctx.lineTo(xx, yy + yo);
    }
    ctx.stroke();
  }
}

function runwayMarks(ctx) {
  const r = world.runway;
  ctx.strokeStyle = 'rgba(240,240,240,0.8)';
  ctx.lineWidth = 4;
  ctx.setLineDash([46, 34]);
  ctx.beginPath();
  ctx.moveTo(r.x + 40, r.y + r.h / 2);
  ctx.lineTo(r.x + r.w - 40, r.y + r.h / 2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = 'rgba(240,240,240,0.85)';
  for (let k = 0; k < 6; k++) ctx.fillRect(r.x + 16 + k * 14, r.y + 10, 8, r.h - 20);
  ctx.font = 'bold 46px Arial Black, Arial';
  ctx.fillText('18', r.x + r.w - 110, r.y + r.h - 12);
}

// ---------------------------------------------------------------- roads
function drawRoads(ctx, v) {
  ctx.fillStyle = '#2a2a31';
  for (const vx of VX) {
    if (vx + ROAD_HALF < v.x0 || vx - ROAD_HALF > v.x1) continue;
    ctx.fillRect(vx - ROAD_HALF, CITY_Y0 - ROAD_HALF, ROAD_W, CITY_Y1 - CITY_Y0 + ROAD_W);
  }
  for (const hy of HY) {
    if (hy + ROAD_HALF < v.y0 || hy - ROAD_HALF > v.y1) continue;
    ctx.fillRect(CITY_X0 - ROAD_HALF, hy - ROAD_HALF, CITY_X1 - CITY_X0 + ROAD_W, ROAD_W);
  }
  // sidewalks
  ctx.fillStyle = '#4a4d55';
  for (const vx of VX) {
    if (vx + ROAD_HALF + 22 < v.x0 || vx - ROAD_HALF - 22 > v.x1) continue;
    ctx.fillRect(vx + ROAD_HALF, CITY_Y0 - ROAD_HALF, 22, CITY_Y1 - CITY_Y0 + ROAD_W);
    ctx.fillRect(vx - ROAD_HALF - 22, CITY_Y0 - ROAD_HALF, 22, CITY_Y1 - CITY_Y0 + ROAD_W);
  }
  for (const hy of HY) {
    if (hy + ROAD_HALF + 22 < v.y0 || hy - ROAD_HALF - 22 > v.y1) continue;
    ctx.fillRect(CITY_X0 - ROAD_HALF, hy + ROAD_HALF, CITY_X1 - CITY_X0 + ROAD_W, 22);
    ctx.fillRect(CITY_X0 - ROAD_HALF, hy - ROAD_HALF - 22, CITY_X1 - CITY_X0 + ROAD_W, 22);
  }
  // center dashes
  ctx.strokeStyle = 'rgba(230,220,120,0.5)';
  ctx.lineWidth = 3;
  ctx.setLineDash([24, 30]);
  ctx.beginPath();
  for (const vx of VX) {
    if (vx < v.x0 - 4 || vx > v.x1 + 4) continue;
    ctx.moveTo(vx, CITY_Y0 - 30); ctx.lineTo(vx, CITY_Y1 + 30);
  }
  for (const hy of HY) {
    if (hy < v.y0 - 4 || hy > v.y1 + 4) continue;
    ctx.moveTo(CITY_X0 - 30, hy); ctx.lineTo(CITY_X1 + 30, hy);
  }
  ctx.stroke();
  ctx.setLineDash([]);
  // crosswalks at intersections in view
  ctx.fillStyle = 'rgba(235,235,235,0.55)';
  for (const vx of VX) {
    if (vx < v.x0 - 100 || vx > v.x1 + 100) continue;
    for (const hy of HY) {
      if (hy < v.y0 - 100 || hy > v.y1 + 100) continue;
      for (let k = -2; k <= 2; k++) {
        ctx.fillRect(vx + k * 11 - 3, hy - ROAD_HALF - 18, 6, 14);
        ctx.fillRect(vx + k * 11 - 3, hy + ROAD_HALF + 4, 6, 14);
        ctx.fillRect(vx - ROAD_HALF - 18, hy + k * 11 - 3, 14, 6);
        ctx.fillRect(vx + ROAD_HALF + 4, hy + k * 11 - 3, 14, 6);
      }
    }
  }
}

// ---------------------------------------------------------------- props
function drawProps(ctx, v) {
  const P = world.props, T = S.time;
  for (const p of P) {
    if (p.x + (p.w ?? 80) < v.x0 || p.x - 40 > v.x1 || p.y + (p.h ?? 80) < v.y0 || p.y - 40 > v.y1) continue;
    switch (p.k) {
      case 'path': ctx.fillStyle = '#6a6a66'; ctx.fillRect(p.x, p.y, p.w, p.h); break;
      case 'fountain': {
        ctx.fillStyle = '#7a7d84'; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, TAU); ctx.fill();
        ctx.fillStyle = '#2a6a9a'; ctx.beginPath(); ctx.arc(p.x, p.y, p.r - 8, 0, TAU); ctx.fill();
        ctx.fillStyle = 'rgba(180,220,255,0.5)';
        ctx.beginPath(); ctx.arc(p.x, p.y, 6 + Math.sin(T * 3) * 2, 0, TAU); ctx.fill();
        break;
      }
      case 'bench': ctx.fillStyle = '#7a5230'; ctx.fillRect(p.x - 14, p.y - 4, 28, 8); break;
      case 'umbrella': {
        ctx.fillStyle = '#c84a5a'; ctx.beginPath(); ctx.arc(p.x, p.y, 14, 0, TAU); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.beginPath(); ctx.arc(p.x - 4, p.y - 4, 6, 0, TAU); ctx.fill();
        break;
      }
      case 'lot': ctx.fillStyle = '#33353b'; ctx.fillRect(p.x, p.y, p.w, p.h); break;
      case 'parkslot': ctx.strokeStyle = 'rgba(230,230,230,0.4)'; ctx.lineWidth = 2;
        ctx.strokeRect(p.x - 18, p.y - 30, 36, 60); break;
      case 'tarmac': break;
      case 'hangar': {
        ctx.fillStyle = '#3f4550'; ctx.fillRect(p.x, p.y, p.w, p.h);
        ctx.fillStyle = p.c; ctx.fillRect(p.x + 6, p.y + 6, p.w - 12, p.h - 12);
        ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 2;
        for (let xx = p.x + 12; xx < p.x + p.w; xx += 18) { ctx.beginPath(); ctx.moveTo(xx, p.y + 6); ctx.lineTo(xx, p.y + p.h - 6); ctx.stroke(); }
        ctx.fillStyle = '#1a1d24'; ctx.fillRect(p.x + p.w / 2 - 30, p.y + p.h - 14, 60, 10);
        break;
      }
      case 'tower': {
        ctx.fillStyle = '#4a505c'; ctx.fillRect(p.x, p.y, p.w, p.h);
        ctx.fillStyle = '#262a33'; ctx.fillRect(p.x + 10, p.y + 10, p.w - 20, p.h - 34);
        ctx.fillStyle = '#7ad0ff'; ctx.globalAlpha = 0.5 + Math.sin(T * 2) * 0.2;
        ctx.fillRect(p.x + p.w / 2 - 4, p.y - 14, 8, 12);
        ctx.globalAlpha = 1;
        break;
      }
      case 'crate': {
        ctx.fillStyle = '#3a3d44'; ctx.fillRect(p.x - 3, p.y - 3, p.w + 6, p.h + 6);
        ctx.fillStyle = p.c; ctx.fillRect(p.x, p.y, p.w, p.h);
        ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.strokeRect(p.x + 6, p.y + 6, p.w - 12, p.h - 12);
        break;
      }
      case 'fence': {
        ctx.strokeStyle = '#8a8f96'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + p.w, p.y + p.h * 0.01); ctx.stroke();
        break;
      }
      case 'beacon': {
        const on = Math.sin(T * 4) > 0;
        if (on) { ctx.fillStyle = '#7aff9a'; ctx.beginPath(); ctx.arc(p.x, p.y, 5, 0, TAU); ctx.fill(); }
        ctx.fillStyle = '#5a6068'; ctx.fillRect(p.x - 3, p.y - 3, 6, 14);
        break;
      }
      case 'windsock': {
        ctx.fillStyle = '#5a6068'; ctx.fillRect(p.x - 2, p.y - 10, 4, 24);
        ctx.fillStyle = '#e88030'; ctx.fillRect(p.x + 2, p.y - 8, 20 + Math.sin(T * 2) * 3, 7);
        break;
      }
      case 'flood': {
        ctx.fillStyle = '#565b63'; ctx.fillRect(p.x - 5, p.y - 5, 10, 26);
        break;
      }
      case 'lighthouse': {
        ctx.fillStyle = '#e8e2d4'; ctx.beginPath(); ctx.arc(p.x, p.y, 22, 0, TAU); ctx.fill();
        ctx.fillStyle = '#c84a3a'; ctx.beginPath(); ctx.arc(p.x, p.y, 22, 0.3, 1.8); ctx.lineTo(p.x, p.y); ctx.fill();
        ctx.beginPath(); ctx.arc(p.x, p.y, 22, 3.4, 5.0); ctx.lineTo(p.x, p.y); ctx.fill();
        ctx.fillStyle = '#2a2a33'; ctx.beginPath(); ctx.arc(p.x, p.y, 8, 0, TAU); ctx.fill();
        const sweep = Math.atan2(Math.sin(T * 0.7), Math.cos(T * 0.7));
        const g = ctx.createRadialGradient(p.x, p.y, 4, p.x, p.y, 220);
        g.addColorStop(0, 'rgba(255,240,190,0.22)');
        g.addColorStop(1, 'rgba(255,240,190,0)');
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(sweep);
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, 220, -0.28, 0.28); ctx.closePath(); ctx.fill();
        ctx.restore();
        break;
      }
      case 'boat': {
        const bob = Math.sin(T * 1.3 + p.ph) * 2.5;
        ctx.save(); ctx.translate(p.x, p.y + bob);
        ctx.fillStyle = '#d8d8dc'; roundRect(ctx, -16, -8, 32, 16, 6); ctx.fill();
        ctx.fillStyle = '#8a4a2a'; ctx.fillRect(-6, -5, 12, 10);
        ctx.restore();
        break;
      }
      case 'ferris': {
        const R = 92;
        ctx.strokeStyle = '#5a6068'; ctx.lineWidth = 6;
        for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(p.x + s * 40, p.y); ctx.lineTo(p.x, p.y - R * 0.8); ctx.stroke(); }
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(p.x, p.y - R * 0.8, R, 0, TAU); ctx.stroke();
        for (let k = 0; k < 12; k++) {
          const a = T * 0.4 + (k / 12) * TAU;
          const gx = p.x + Math.cos(a) * R, gy = p.y - R * 0.8 + Math.sin(a) * R;
          ctx.strokeStyle = 'rgba(90,96,104,0.7)';
          ctx.beginPath(); ctx.moveTo(p.x, p.y - R * 0.8); ctx.lineTo(gx, gy); ctx.stroke();
          ctx.fillStyle = k % 3 === 0 ? '#ff5e8a' : k % 3 === 1 ? '#39c8ff' : '#ffe14d';
          roundRect(ctx, gx - 8, gy - 6, 16, 12, 3); ctx.fill();
        }
        break;
      }
      case 'stadium': {
        ctx.fillStyle = '#3a4048'; roundRect(ctx, p.x, p.y, p.w, p.h, 30); ctx.fill();
        ctx.fillStyle = '#2b3f33'; roundRect(ctx, p.x + 22, p.y + 22, p.w - 44, p.h - 44, 20); ctx.fill();
        ctx.fillStyle = '#4a7a52'; ctx.beginPath(); ctx.ellipse(p.x + p.w / 2, p.y + p.h / 2, p.w * 0.3, p.h * 0.3, 0, 0, TAU); ctx.fill();
        ctx.strokeStyle = 'rgba(240,240,240,0.7)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.ellipse(p.x + p.w / 2, p.y + p.h / 2, p.w * 0.3, p.h * 0.3, 0, 0, TAU); ctx.stroke();
        ctx.fillStyle = '#ffe14d';
        for (const s of [[p.x + 30, p.y + 18], [p.x + p.w - 44, p.y + 18], [p.x + 30, p.y + p.h - 26], [p.x + p.w - 44, p.y + p.h - 26]]) ctx.fillRect(s[0], s[1], 14, 8);
        break;
      }
      case 'busstop': {
        ctx.fillStyle = '#2a3a4a'; roundRect(ctx, p.x - 22, p.y - 8, 44, 14, 4); ctx.fill();
        ctx.fillStyle = '#39c8ff'; ctx.globalAlpha = 0.6; ctx.fillRect(p.x - 16, p.y - 5, 32, 8); ctx.globalAlpha = 1;
        ctx.fillStyle = '#565b63'; ctx.fillRect(p.x - 24, p.y + 6, 4, 10); ctx.fillRect(p.x + 20, p.y + 6, 4, 10);
        break;
      }
      case 'booth': {
        ctx.fillStyle = '#2a6a4a'; roundRect(ctx, p.x - 8, p.y - 8, 16, 16, 3); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.fillRect(p.x - 5, p.y - 5, 10, 7);
        break;
      }
      case 'vend': {
        ctx.fillStyle = '#8a2a4a'; roundRect(ctx, p.x - 7, p.y - 9, 14, 18, 3); ctx.fill();
        ctx.fillStyle = '#ffe14d'; ctx.fillRect(p.x - 4, p.y - 6, 8, 6);
        break;
      }
      case 'helipad': {
        ctx.fillStyle = '#3a3f47'; ctx.beginPath(); ctx.arc(p.x, p.y, 26, 0, TAU); ctx.fill();
        ctx.fillStyle = 'rgba(230,230,230,0.7)'; ctx.font = 'bold 26px Arial'; ctx.textAlign = 'center';
        ctx.fillText('H', p.x, p.y + 9); ctx.textAlign = 'left';
        break;
      }
    }
  }
  // piers
  for (const pi of world.piers) {
    ctx.fillStyle = '#6a5238'; ctx.fillRect(pi.x, pi.y, pi.w, pi.h);
    ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 2;
    for (let yy = pi.y + 12; yy < pi.y + pi.h; yy += 22) { ctx.beginPath(); ctx.moveTo(pi.x, yy); ctx.lineTo(pi.x + pi.w, yy); ctx.stroke(); }
  }
  // containers
  for (const c of world.containers) {
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(c.x + 5, c.y + 5, c.w, c.h);
    ctx.fillStyle = c.c; ctx.fillRect(c.x, c.y, c.w, c.h);
    ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 2;
    ctx.strokeRect(c.x + 4, c.y + 4, c.w - 8, c.h - 8);
    if (c.stack) { ctx.fillStyle = c.stack; ctx.fillRect(c.x + 8, c.y - 26, c.w - 16, c.h - 10); ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.strokeRect(c.x + 12, c.y - 22, c.w - 24, c.h - 18); }
  }
  // cranes
  for (const cr of world.cranes) {
    ctx.fillStyle = '#c8a020'; ctx.fillRect(cr.x, cr.y, 10, cr.h); ctx.fillRect(cr.x + cr.w - 10, cr.y, 10, cr.h);
    ctx.fillRect(cr.x - 6, cr.y, cr.w + 12, 12);
    const trolley = cr.x + 10 + ((Math.sin(S.time * 0.3 + cr.arm) * 0.5 + 0.5) * (cr.w - 20));
    ctx.fillStyle = '#8a6a10'; ctx.fillRect(trolley - 6, cr.y + 12, 12, 10);
    ctx.strokeStyle = '#c8c8c8'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(trolley, cr.y + 22); ctx.lineTo(trolley, cr.y + 74); ctx.stroke();
    ctx.fillStyle = '#2a2a2a'; ctx.fillRect(trolley - 10, cr.y + 74, 20, 10);
  }
  // ship
  const sh = world.ship;
  if (sh.x + sh.w > v.x0 && sh.x < v.x1) {
    ctx.fillStyle = '#22262e'; ctx.fillRect(sh.x, sh.y, sh.w, sh.h);
    ctx.fillStyle = '#8a2a2a'; ctx.fillRect(sh.x, sh.y + sh.h - 12, sh.w, 12);
    ctx.fillStyle = '#39404c'; ctx.fillRect(sh.x + 40, sh.y + 16, sh.w - 80, sh.h - 44);
    for (let k = 0; k < 5; k++) ctx.fillStyle = ['#b8453c', '#3c7ab8', '#3cb85c', '#b89a3c', '#8a5cb8'][k], ctx.fillRect(sh.x + 50 + k * 92, sh.y + 22, 80, 26);
    ctx.fillStyle = '#d8d8e0'; ctx.fillRect(sh.x + sh.w - 96, sh.y + sh.h - 52, 54, 30);
    ctx.fillStyle = '#ffd76a'; for (let k = 0; k < 6; k++) ctx.fillRect(sh.x + 20 + k * 90, sh.y + sh.h - 18, 8, 6);
  }
}

function drawSkids(ctx, v) {
  ctx.fillStyle = 'rgba(15,15,18,0.5)';
  for (const sk of S.skids) {
    if (sk.x < v.x0 || sk.x > v.x1 || sk.y < v.y0 || sk.y > v.y1) continue;
    ctx.save(); ctx.translate(sk.x, sk.y); ctx.rotate(sk.a);
    ctx.fillRect(-6, -2, 12, 4);
    ctx.restore();
  }
}

// ---------------------------------------------------------------- markers
function drawMarkers(ctx) {
  const t = S.time;
  for (const m of markers()) {
    const r = 34 + Math.sin(t * 3) * 5;
    const story = m.kind === 'story';
    ctx.fillStyle = story ? 'rgba(190,90,255,0.22)' : 'rgba(60,180,255,0.2)';
    ctx.beginPath(); ctx.arc(m.x, m.y, r, 0, TAU); ctx.fill();
    ctx.strokeStyle = story ? 'rgba(220,130,255,0.9)' : 'rgba(90,200,255,0.9)';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(m.x, m.y, r + 6, 0, TAU); ctx.stroke();
  }
  // pay'n'spray pad
  {
    const r = 50 + Math.sin(t * 2.4) * 4;
    ctx.fillStyle = 'rgba(90,200,120,0.14)';
    ctx.beginPath(); ctx.arc(4020, 2010, r, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(120,230,150,0.8)';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(4020, 2010, r + 5, 0, TAU); ctx.stroke();
    ctx.font = 'bold 11px Arial';
    ctx.fillStyle = 'rgba(160,255,190,0.9)';
    ctx.textAlign = 'center';
    ctx.fillText("PAY 'N SPRAY", 4020, 2010 - r - 10);
    ctx.textAlign = 'left';
  }
  const b = S.mission.blip;
  if (b && (S.mission.active || S.mission.side)) {
    const r = 40 + Math.sin(t * 4) * 6;
    ctx.strokeStyle = 'rgba(255,210,60,0.9)';
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(b.x, b.y, r, 0, TAU); ctx.stroke();
    ctx.fillStyle = 'rgba(255,210,60,0.18)';
    ctx.beginPath(); ctx.arc(b.x, b.y, r, 0, TAU); ctx.fill();
  }
  // collectible packages drawn at fixed spots
  const m2 = S.mission.active || S.mission.side;
  if (m2) {
    const st = m2.def.stages[m2.si];
    if (st && st.k === 'collect') {
      const it = st.items[m2.got];
      if (it) {
        ctx.save(); ctx.translate(it.x, it.y + Math.sin(t * 3) * 3);
        ctx.fillStyle = '#a06a2a'; ctx.fillRect(-10, -8, 20, 16);
        ctx.fillStyle = '#c8873a'; ctx.fillRect(-10, -3, 20, 4);
        ctx.restore();
      }
    }
  }
}

// ---------------------------------------------------------------- buildings
function drawBuildings(ctx, v) {
  const night = true;
  for (const b of world.buildings) {
    if (b.x + b.w < v.x0 || b.x > v.x1 || b.y + b.h < v.y0 || b.y > v.y1) continue;
    // shadow
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(b.x + 9, b.y + 9, b.w, b.h);
    // body
    ctx.fillStyle = b.c;
    ctx.fillRect(b.x, b.y, b.w, b.h);
    // roof inset
    ctx.fillStyle = b.roof;
    ctx.fillRect(b.x + 7, b.y + 7, b.w - 14, b.h - 14);
    if (b.tall) { // downtown: roof gear + AC
      ctx.fillStyle = 'rgba(255,255,255,0.06)';
      ctx.fillRect(b.x + 14, b.y + 14, b.w - 28, b.h - 28);
      const n = Math.max(1, Math.floor(b.w * b.h / 6000));
      for (let k = 0; k < n; k++) {
        const hx = hash2(b.hsh + k, 7), hy2 = hash2(b.hsh + k, 13);
        ctx.fillStyle = '#191d29';
        ctx.fillRect(b.x + 16 + hx * (b.w - 46), b.y + 16 + hy2 * (b.h - 46), 26, 22);
      }
    }
    // windows (perimeter dots; only lit ones — the night layer hides the rest)
    if (b.w > 60 && b.h > 50) {
      const step = 18;
      for (let xx = b.x + 12; xx < b.x + b.w - 12; xx += step) {
        for (let yy = b.y + 12; yy < b.y + b.h - 12; yy += step) {
          if (hash2(xx | 0, yy | 0) < 0.34) {
            ctx.fillStyle = 'rgba(255,214,120,0.75)';
            ctx.fillRect(xx, yy, 5, 4);
          }
        }
      }
    }
    // damaged crack look for husk-adjacent? skip
  }
  // neon signs (glow in the light pass; base text here)
  for (const n of world.neons) {
    if (n.x < v.x0 - 160 || n.x > v.x1 + 160 || n.y < v.y0 - 60 || n.y > v.y1 + 60) continue;
    const flick = hash2((S.time * 7) | 0, n.x | 0) < 0.06 ? 0.3 : 1;
    ctx.font = `bold ${n.w}px Arial Black, Arial`;
    ctx.fillStyle = 'rgba(20,20,26,0.9)';
    ctx.fillText(n.text, n.x - ctx.measureText(n.text).width / 2 + 1, n.y + 1);
    ctx.fillStyle = n.c;
    ctx.globalAlpha = 0.85 * flick;
    ctx.fillText(n.text, n.x - ctx.measureText(n.text).width / 2, n.y);
    ctx.globalAlpha = 1;
  }
}

// ---------------------------------------------------------------- flora & lamps
function drawPalmsLamps(ctx, v) {
  for (const l of world.lamps) {
    if (l.x < v.x0 - 30 || l.x > v.x1 + 30 || l.y < v.y0 - 30 || l.y > v.y1 + 30) continue;
    ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.fillRect(l.x + 3, l.y + 3, 5, 14);
    ctx.fillStyle = '#565b63'; ctx.fillRect(l.x, l.y, 5, 14);
    ctx.fillStyle = '#ffe9a8'; ctx.fillRect(l.x - 2, l.y + 12, 9, 5);
  }
  for (const p of world.palms) {
    if (p.x < v.x0 - 40 || p.x > v.x1 + 40 || p.y < v.y0 - 40 || p.y > v.y1 + 40) continue;
    const s = p.s ?? 1, t = S.time;
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath(); ctx.ellipse(p.x + 12, p.y + 10, 26 * s, 15 * s, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#6a4a2c';
    ctx.fillRect(p.x - 3 * s, p.y - 10 * s, 6 * s, 14 * s);
    ctx.fillStyle = '#2e7a3c';
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * TAU + Math.sin(t + p.x) * 0.06;
      ctx.save(); ctx.translate(p.x, p.y - 12 * s); ctx.rotate(a);
      ctx.beginPath(); ctx.ellipse(16 * s, 0, 18 * s, 6 * s, 0, 0, TAU); ctx.fill();
      ctx.restore();
    }
    ctx.fillStyle = '#3c9a4e';
    ctx.beginPath(); ctx.arc(p.x, p.y - 12 * s, 5 * s, 0, TAU); ctx.fill();
  }
}

// ---------------------------------------------------------------- entities
function drawBodies(ctx) {
  for (const b of S.bodies) {
    ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.ang);
    ctx.fillStyle = b.kind === 'cop' ? '#26324a' : '#8a8078';
    ctx.beginPath(); ctx.ellipse(0, 0, 10, 6, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = b.kind === 'cop' ? '#39466a' : '#a09890';
    ctx.beginPath(); ctx.arc(0, -3, 4, 0, TAU); ctx.fill();
    ctx.restore();
  }
}

function drawCarBody(ctx, car) {
  const sp = car.spec;
  ctx.save();
  ctx.translate(car.x, car.y);
  ctx.rotate(car.ang);
  const L = sp.l, W = sp.w;
  // shadow
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  roundRect(ctx, -L / 2 + 4, -W / 2 + 5, L, W, 5);
  ctx.fill();
  // wheels
  ctx.fillStyle = '#15151a';
  const steer = car.steerVis * 0.5;
  for (const [wx, wy, rot] of [[L * 0.32, -W / 2, steer], [L * 0.32, W / 2 - 4, steer], [-L * 0.32, -W / 2, 0], [-L * 0.32, W / 2 - 4, 0]]) {
    ctx.save(); ctx.translate(wx, wy + 2); ctx.rotate(rot);
    ctx.fillRect(-4.5, -2.5, 9, 5);
    ctx.restore();
  }
  // body
  const dmg = car.hp / car.maxHp;
  ctx.fillStyle = car.dead ? '#1c1c1e' : car.color;
  roundRect(ctx, -L / 2, -W / 2, L, W, 6);
  ctx.fill();
  // cabin
  ctx.fillStyle = car.dead ? '#111114' : 'rgba(20,26,40,0.85)';
  roundRect(ctx, -L * 0.12, -W / 2 + 3, L * 0.4, W - 6, 4);
  ctx.fill();
  // windshield shine
  ctx.fillStyle = 'rgba(160,200,255,0.28)';
  ctx.fillRect(L * 0.16, -W / 2 + 4, 5, W - 8);
  // hood stripe for sports/muscle
  if (car.type === 'sports' || car.type === 'muscle') {
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.fillRect(L * 0.2, -2, L * 0.28, 4);
  }
  // damage scratches
  if (dmg < 0.65 && !car.dead) {
    ctx.strokeStyle = 'rgba(20,20,20,0.5)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(-L * 0.3, -W * 0.3); ctx.lineTo(L * 0.05, -W * 0.1); ctx.stroke();
    if (dmg < 0.35) { ctx.beginPath(); ctx.moveTo(L * 0.2, W * 0.2); ctx.lineTo(-L * 0.1, W * 0.35); ctx.stroke(); }
  }
  // type details
  if (car.type === 'taxi') {
    ctx.fillStyle = '#15151a'; ctx.fillRect(-6, -W / 2 - 3, 12, 4);
  }
  if (car.type === 'police') {
    ctx.fillStyle = '#2a4a8a'; ctx.fillRect(-L / 2 + 4, -W / 2 + 2, L - 8, 5);
    ctx.font = 'bold 6px Arial'; ctx.fillStyle = '#1a2a4a';
    ctx.save(); ctx.rotate(Math.PI / 2); ctx.textAlign = 'center';
    ctx.restore();
    // lightbar
    const flash = Math.sin(S.time * 14) > 0;
    ctx.fillStyle = flash ? '#ff3040' : '#3a3a44'; ctx.fillRect(-4, -W / 2 - 2, 7, 4);
    ctx.fillStyle = flash ? '#3a3a44' : '#2060ff'; ctx.fillRect(3, -W / 2 - 2, 7, 4);
    if (car.siren) {
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = flash ? 'rgba(255,40,60,0.8)' : 'rgba(40,90,255,0.8)';
      ctx.beginPath(); ctx.arc(0, 0, 34, 0, TAU); ctx.fill();
      ctx.globalAlpha = 1;
    }
  }
  // pickup bed
  if (car.type === 'pickup') {
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(-L / 2 + 5, -W / 2 + 4, L * 0.3, W - 8);
  }
  // fire
  if (car.explodeT >= 0 && !car.dead) {
    for (let k = 0; k < 3; k++) {
      const fx = (Math.random() - 0.5) * L * 0.5, fy = (Math.random() - 0.5) * W * 0.6;
      ctx.fillStyle = k % 2 ? 'rgba(255,140,30,0.8)' : 'rgba(255,210,60,0.9)';
      ctx.beginPath(); ctx.arc(fx, fy, 4 + Math.random() * 5, 0, TAU); ctx.fill();
    }
  }
  ctx.restore();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawCars(ctx, v) {
  for (const car of S.cars) {
    if (car.x < v.x0 - 80 || car.x > v.x1 + 80 || car.y < v.y0 - 80 || car.y > v.y1 + 80) continue;
    drawCarBody(ctx, car);
    // headlight glow pool in front (cheap additive done in glow pass too)
  }
}

// ---------------------------------------------------------------- pickups
function drawPickups(ctx, v) {
  for (const pk of world.pickups) {
    if (!pk.live) continue;
    if (pk.x < v.x0 - 30 || pk.x > v.x1 + 30 || pk.y < v.y0 - 30 || pk.y > v.y1 + 30) continue;
    const bob = Math.sin(S.time * 3 + pk.x) * 3;
    const cols = { health: '#3adf6a', armor: '#5ab4ff', ammo: '#ffe14d', cash: '#7be495', smg: '#ff9a3c' };
    const c = cols[pk.kind] ?? '#fff';
    ctx.save();
    ctx.translate(pk.x, pk.y + bob);
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath(); ctx.ellipse(0, 10 - bob, 10, 4, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = c;
    if (pk.kind === 'health') { // cross
      roundRect(ctx, -9, -3, 18, 6, 2); ctx.fill();
      roundRect(ctx, -3, -9, 6, 18, 2); ctx.fill();
    } else if (pk.kind === 'armor') { // shield
      ctx.beginPath(); ctx.moveTo(0, -10); ctx.lineTo(9, -6); ctx.lineTo(9, 3);
      ctx.quadraticCurveTo(9, 9, 0, 11); ctx.quadraticCurveTo(-9, 9, -9, 3);
      ctx.lineTo(-9, -6); ctx.closePath(); ctx.fill();
    } else if (pk.kind === 'ammo') { // magazine box
      roundRect(ctx, -8, -6, 16, 12, 2); ctx.fill();
      ctx.fillStyle = '#2a2a30'; ctx.fillRect(-5, -3, 10, 6);
    } else if (pk.kind === 'cash') { // banded stack
      roundRect(ctx, -9, -5, 18, 10, 2); ctx.fill();
      ctx.fillStyle = '#2a5a34'; ctx.fillRect(-9, -1, 18, 2);
    } else { // smg silhouette
      roundRect(ctx, -10, -3, 20, 6, 2); ctx.fill();
      ctx.fillRect(-2, 2, 4, 6);
      ctx.fillRect(6, -1, 5, 3);
    }
    ctx.restore();
    // soft pulse halo
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = c.replace(')', '') === c ? c : c; // noop guard
    ctx.globalAlpha = 0.12 + Math.sin(S.time * 4 + pk.x) * 0.06;
    ctx.beginPath(); ctx.arc(pk.x, pk.y, 22, 0, TAU); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }
}

// ---------------------------------------------------------------- helicopter
function drawHeli(ctx, v) {
  const h = S.heli;
  if (!h) return;
  const [hx, hy] = [h.x, h.y];
  // searchlight pool on the ground
  ctx.globalCompositeOperation = 'lighter';
  const g = ctx.createRadialGradient(hx, hy, 4, hx, hy, 150);
  g.addColorStop(0, 'rgba(255,250,210,0.28)');
  g.addColorStop(1, 'rgba(255,250,210,0)');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(hx, hy, 150, 0, TAU); ctx.fill();
  ctx.globalCompositeOperation = 'source-over';
  // hull (drawn slightly larger than ground vehicles — it's airborne)
  ctx.save();
  ctx.translate(hx, hy);
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath(); ctx.ellipse(26, 30, 34, 12, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = '#26324a';
  roundRect(ctx, -22, -9, 44, 18, 8); ctx.fill();
  ctx.fillStyle = '#1a2233';
  ctx.fillRect(18, -3, 26, 6);
  ctx.fillStyle = '#8ac8ff'; roundRect(ctx, -18, -6, 16, 12, 5); ctx.fill();
  // rotor
  ctx.strokeStyle = 'rgba(210,215,225,0.85)';
  ctx.lineWidth = 3;
  for (let k = 0; k < 3; k++) {
    const a = h.rot + (k / 3) * TAU;
    ctx.beginPath(); ctx.moveTo(Math.cos(a) * 46, Math.sin(a) * 46 * 0.5); ctx.lineTo(-Math.cos(a) * 46, -Math.sin(a) * 46 * 0.5); ctx.stroke();
  }
  ctx.strokeStyle = '#565b63'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -3); ctx.stroke();
  // tail rotor
  ctx.save(); ctx.translate(40, 0); ctx.rotate(h.rot * 2);
  ctx.beginPath(); ctx.moveTo(0, -10); ctx.lineTo(0, 10); ctx.stroke();
  ctx.restore();
  // strobe
  if (Math.sin(S.time * 6) > 0.7) { ctx.fillStyle = '#ff3050'; ctx.beginPath(); ctx.arc(-20, 0, 3.4, 0, TAU); ctx.fill(); }
  ctx.restore();
}

// ---------------------------------------------------------------- big map
export function drawBigMap(ctx) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = 'rgba(4,6,14,0.86)';
  ctx.fillRect(0, 0, VW, VH);
  const s = Math.min((VW - 320) / 6400, (VH - 160) / 4800); // world → map scale
  const ox = (VW - 6400 * s) / 2, oy = (VH - 4800 * s) / 2;
  ctx.save();
  ctx.translate(ox, oy);
  ctx.scale(s, s);
  // ground zones
  ctx.fillStyle = '#1a3324'; ctx.fillRect(0, 0, 6400, 4800);
  ctx.fillStyle = '#0c2440'; ctx.fillRect(0, 4400, 6400, 400); ctx.fillRect(0, 0, 1820, 260);
  ctx.fillStyle = '#c8b088'; ctx.fillRect(0, 4182, 6400, 218);
  ctx.fillStyle = '#24512f'; ctx.fillRect(1932, 2332, 736, 736);
  ctx.fillStyle = '#33363c'; ctx.fillRect(4740, 240, 1440, 1230);
  ctx.fillStyle = '#3a3f46'; ctx.fillRect(282, 282, 1616, 872);
  // roads
  ctx.strokeStyle = '#5a5f68'; ctx.lineWidth = ROAD_W * 1.1;
  ctx.beginPath();
  for (const vx of VX) { ctx.moveTo(vx, 250); ctx.lineTo(vx, 4182); }
  for (const hy of HY) { ctx.moveTo(250, hy); ctx.lineTo(5950, hy); }
  ctx.stroke();
  // airport & docks markers
  ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 12;
  ctx.strokeRect(4740, 826, 1420, 84);
  ctx.strokeRect(60, 0, 1760, 260);
  ctx.restore();
  // blips
  const blip = (wx, wy, col, r = 6) => {
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.arc(ox + wx * s, oy + wy * s, r, 0, TAU); ctx.fill();
  };
  for (const m of markers()) blip(m.x, m.y, m.kind === 'story' ? '#c060ff' : '#39c8ff', 7);
  if (S.mission.blip) blip(S.mission.blip.x, S.mission.blip.y, '#ffd23c', 7);
  for (const car of S.cars) if (car.ai === 'police' && !car.dead) blip(car.x, car.y, '#ff4040', 4);
  for (const cop of S.cops) if (!cop.dead) blip(cop.x, cop.y, '#ff6050', 3.4);
  if (S.heli) blip(S.heli.x, S.heli.y, '#ff4040', 5);
  const p = S.player;
  if (p) {
    ctx.save();
    ctx.translate(ox + p.x * s, oy + p.y * s);
    ctx.rotate(p.inCar ? p.inCar.ang : p.ang);
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.moveTo(9, 0); ctx.lineTo(-6, -6); ctx.lineTo(-6, 6); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
  // legend + zone names
  ctx.font = 'bold 20px Arial Black, Arial';
  ctx.fillStyle = '#a9f4ff';
  ctx.fillText('VICE PALMS — CITY MAP', 24, 42);
  ctx.font = '13px Arial';
  ctx.fillStyle = '#cfd4de';
  const legend = [
    ['#c060ff', 'story mission'], ['#39c8ff', 'side job'], ['#ffd23c', 'objective'],
    ['#ff4040', 'police'], ['#5a5f68', 'roads'],
  ];
  legend.forEach(([c, label], i) => {
    ctx.fillStyle = c;
    ctx.beginPath(); ctx.arc(40, 78 + i * 24, 5, 0, TAU); ctx.fill();
    ctx.fillStyle = '#cfd4de';
    ctx.fillText(label, 54, 82 + i * 24);
  });
  ctx.fillStyle = '#8a93a8';
  ctx.textAlign = 'center';
  ctx.fillText('TAB / ESC to close', VW / 2, VH - 26);
  ctx.textAlign = 'left';
  // zone name labels
  ctx.font = 'bold 15px Arial Black, Arial';
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.textAlign = 'center';
  for (const [zx, zy, name] of [[1100, 700, 'NORTH DOCKS'], [5450, 400, 'PALM AIRFIELD'], [3100, 2300, 'DOWNTOWN'], [3100, 4290, 'OCEAN BEACH'], [2600, 2700, 'PALM PARK'], [1100, 2500, 'LITTLE HAVANA'], [4400, 2500, 'VICE HEIGHTS']]) {
    ctx.fillText(name, ox + zx * s, oy + zy * s);
  }
  ctx.textAlign = 'left';
}

function drawPeople(ctx) {
  const t = S.time;
  // peds
  for (const pd of S.peds) {
    if (pd.dead) continue;
    drawPerson(ctx, pd.x, pd.y, pd.ang, pd.shirt, pd.pants, pd.skin, 0.9, pd.arms && 1, pd.walkT);
    // dogs trot behind their walker
    if (pd.dog) {
      const d = pd.dog;
      ctx.save();
      ctx.translate(d.x, d.y);
      ctx.rotate(d.ang);
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath(); ctx.ellipse(2, 2, 7, 4, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = d.c;
      roundRect(ctx, -6, -3.4, 12, 6.8, 3); ctx.fill();
      ctx.beginPath(); ctx.arc(6, -1, 3, 0, TAU); ctx.fill();
      ctx.fillRect(7, -1, 3, 1.4);
      // wag
      ctx.strokeStyle = d.c; ctx.lineWidth = 1.8;
      ctx.beginPath(); ctx.moveTo(-6, 0); ctx.lineTo(-10, Math.sin(S.time * 9 + d.ph) * 3); ctx.stroke();
      ctx.restore();
    }
  }
  // foot cops
  for (const cop of S.cops) {
    if (cop.dead) continue;
    drawPerson(ctx, cop.x, cop.y, cop.ang, '#26324a', '#1a2233', '#d8b090', 1, 2, cop.lifeT);
    ctx.fillStyle = '#f0d040';
    ctx.fillRect(cop.x - 4, cop.y - 9, 8, 3);
  }
  // player
  const p = S.player;
  if (p && !p.inCar && !p.dead) {
    const aim = p.weapon === 'pistol' || S.mode === 'playing';
    drawPerson(ctx, p.x, p.y, p.ang, '#e8e2d4', '#2a3a5a', '#e8b890', 1.15, p.weapon === 'pistol' ? 2 : 0, p.walkPhase);
    // gun
    if (p.weapon === 'pistol') {
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.aimAng);
      ctx.fillStyle = '#20242c'; ctx.fillRect(8, -2, 11, 4);
      if (p.muzzleT > 0) {
        ctx.fillStyle = 'rgba(255,220,120,0.95)';
        ctx.beginPath(); ctx.arc(24, 0, 6 + Math.random() * 3, 0, TAU); ctx.fill();
      }
      ctx.restore();
    }
    // hurt flash
    if (p.hurtT > 0) {
      ctx.fillStyle = `rgba(255,40,40,${p.hurtT})`;
      ctx.beginPath(); ctx.arc(p.x, p.y, 12, 0, TAU); ctx.fill();
    }
  }
}

function drawPerson(ctx, x, y, ang, shirt, pants, skin, s, arms, walk) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath(); ctx.ellipse(3, 4, 9 * s, 6 * s, 0, 0, TAU); ctx.fill();
  ctx.rotate(ang);
  const sw = Math.sin(walk || 0) * 3 * s;
  // feet
  ctx.fillStyle = '#181820';
  ctx.fillRect(2, -6 * s + sw * 0.4, 5 * s, 4 * s);
  ctx.fillRect(2, 2 * s - sw * 0.4, 5 * s, 4 * s);
  // body
  ctx.fillStyle = shirt;
  roundRect(ctx, -6 * s, -5.5 * s, 12 * s, 11 * s, 4);
  ctx.fill();
  // arms (0 none, 1 panic up, 2 gun forward)
  ctx.fillStyle = skin;
  if (arms === 1) { ctx.fillRect(4 * s, -8 * s, 3 * s, 5 * s); ctx.fillRect(4 * s, 3 * s, 3 * s, 5 * s); }
  else if (arms === 2) { ctx.fillRect(4 * s, -2 * s, 6 * s, 2.5 * s); }
  else { ctx.fillRect(4 * s, -6 * s, 3 * s, 4 * s); ctx.fillRect(4 * s, 2 * s, 3 * s, 4 * s); }
  // head
  ctx.fillStyle = skin;
  ctx.beginPath(); ctx.arc(1.5 * s, 0, 4.4 * s, 0, TAU); ctx.fill();
  ctx.fillStyle = 'rgba(30,20,12,0.85)';
  ctx.beginPath(); ctx.arc(-0.6 * s, 0, 3.4 * s, 0, TAU); ctx.fill();
  ctx.restore();
}

function drawBullets(ctx) {
  ctx.lineWidth = 2.4;
  for (const b of S.bullets) {
    ctx.strokeStyle = b.owner === 'cop' ? 'rgba(255,190,120,0.95)' : 'rgba(255,240,180,0.95)';
    ctx.beginPath();
    ctx.moveTo(b.x, b.y);
    ctx.lineTo(b.x - b.dx * 14, b.y - b.dy * 14);
    ctx.stroke();
  }
}

function drawParticles(ctx) {
  for (const p of S.particles) {
    const lt = 1 - p.life / p.max;
    if (p.k === 'smoke') {
      ctx.fillStyle = p.dark ? `rgba(30,28,28,${0.5 * (1 - lt)})` : `rgba(140,140,145,${0.4 * (1 - lt)})`;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r * (1 + lt * 1.6), 0, TAU); ctx.fill();
    } else if (p.k === 'fire') {
      ctx.fillStyle = lt < 0.5 ? `rgba(255,170,40,${0.8 * (1 - lt)})` : `rgba(255,90,20,${0.7 * (1 - lt)})`;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r * (1 - lt * 0.5), 0, TAU); ctx.fill();
    } else if (p.k === 'spark') {
      ctx.fillStyle = `rgba(255,220,120,${1 - lt})`;
      ctx.fillRect(p.x - 1.5, p.y - 1.5, 3, 3);
    } else if (p.k === 'blood') {
      ctx.fillStyle = `rgba(170,20,20,${0.8 * (1 - lt)})`;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r * (1 - lt * 0.6), 0, TAU); ctx.fill();
    } else if (p.k === 'cash') {
      ctx.fillStyle = `rgba(120,230,130,${1 - lt})`;
      ctx.font = 'bold 14px Arial Black, Arial';
      ctx.fillText(p.text, p.x, p.y - lt * 30);
    } else if (p.k === 'ring') {
      ctx.strokeStyle = `rgba(255,255,255,${0.6 * (1 - lt)})`;
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r * lt * 2.4, 0, TAU); ctx.stroke();
    }
  }
}

function drawExplosions(ctx) {
  for (const e of S.explosions) {
    const lt = e.t / e.max;
    const r = e.power * 130 * Math.sqrt(lt);
    ctx.fillStyle = `rgba(255,190,60,${0.75 * (1 - lt)})`;
    ctx.beginPath(); ctx.arc(e.x, e.y, r, 0, TAU); ctx.fill();
    ctx.fillStyle = `rgba(255,255,220,${0.5 * (1 - lt)})`;
    ctx.beginPath(); ctx.arc(e.x, e.y, r * 0.55, 0, TAU); ctx.fill();
  }
}

// ---------------------------------------------------------------- night & glow
function nightPass(ctx, v) {
  dctx.setTransform(1, 0, 0, 1, 0, 0);
  dctx.globalCompositeOperation = 'source-over';
  dctx.clearRect(0, 0, VW, VH);
  dctx.fillStyle = 'rgba(10,10,38,0.58)';
  dctx.fillRect(0, 0, VW, VH);
  const c = S.cam, z = c.zoom;
  const w2s = (wx, wy) => [VW / 2 + (wx - c.x) * z, VH / 2 + (wy - c.y) * z];
  dctx.globalCompositeOperation = 'destination-out';
  const hole = (wx, wy, r, a) => {
    const [sx, sy] = w2s(wx, wy);
    if (sx < -r || sx > VW + r || sy < -r || sy > VH + r) return;
    dctx.globalAlpha = a;
    dctx.drawImage(lightSprite, sx - r, sy - r, r * 2, r * 2);
  };
  for (const l of world.lamps) hole(l.x, l.y + 8, 120, 0.85);
  for (const n of world.neons) hole(n.x, n.y, 105, 0.7);
  for (const p of world.props) if (p.k === 'flood') hole(p.x, p.y + 20, 130, 0.9);
  for (const p of world.props) if (p.k === 'beacon' || p.k === 'fountain') hole(p.x, p.y, 70, 0.4);
  // windows of visible tall buildings
  for (const b of world.buildings) {
    if (b.x + b.w < v.x0 || b.x > v.x1 || b.y + b.h < v.y0 || b.y > v.y1) continue;
    hole(b.x + b.w / 2, b.y + b.h / 2, Math.max(b.w, b.h) * 0.42, 0.24);
  }
  // headlights
  for (const car of S.cars) {
    if (car.dead) continue;
    if (car.x < v.x0 - 300 || car.x > v.x1 + 300 || car.y < v.y0 - 300 || car.y > v.y1 + 300) continue;
    const ca = Math.cos(car.ang), sa = Math.sin(car.ang);
    const nx = -sa, ny = ca;
    for (const s of [-1, 1]) {
      const hx = car.x + ca * car.spec.l * 0.45 + nx * s * car.spec.w * 0.32;
      const hy = car.y + sa * car.spec.l * 0.45 + ny * s * car.spec.w * 0.32;
      const [sx, sy] = w2s(hx, hy);
      dctx.globalAlpha = 0.85;
      dctx.save();
      dctx.translate(sx, sy);
      dctx.rotate(car.ang);
      dctx.scale(1, 0.55);
      dctx.drawImage(lightSprite, 0, -95, 340, 190);
      dctx.restore();
    }
    // taillights
    hole(car.x - ca * car.spec.l * 0.5, car.y - sa * car.spec.l * 0.5, 40, 0.5);
  }
  // explosions light up everything
  for (const e of S.explosions) hole(e.x, e.y, e.power * 260, 0.95);
  // player muzzle
  if (S.player && S.player.muzzleT > 0) hole(S.player.x, S.player.y, 130, 0.8);
  dctx.globalAlpha = 1;
  dctx.globalCompositeOperation = 'source-over';
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(darkness, 0, 0);
  // restore world transform
  ctx.setTransform(z, 0, 0, z, VW / 2 - c.x * z + c.sx, VH / 2 - c.y * z + c.sy);
}

function glowPass(ctx, v) {
  const c = S.cam, z = c.zoom;
  ctx.globalCompositeOperation = 'lighter';
  // neon glow
  for (const n of world.neons) {
    if (n.x < v.x0 - 160 || n.x > v.x1 + 160 || n.y < v.y0 - 60 || n.y > v.y1 + 60) continue;
    const flick = hash2((S.time * 7) | 0, n.x | 0) < 0.06 ? 0.25 : 0.5;
    ctx.font = `bold ${n.w}px Arial Black, Arial`;
    const w = ctx.measureText(n.text).width;
    const g = ctx.createRadialGradient(n.x, n.y, 2, n.x, n.y, w * 0.75);
    g.addColorStop(0, hexA(n.c, flick));
    g.addColorStop(1, hexA(n.c, 0));
    ctx.fillStyle = g;
    ctx.fillRect(n.x - w, n.y - 26, w * 2, 52);
  }
  // wet-road sheen: streaks below lamps aligned with the road axis
  ctx.fillStyle = 'rgba(150,190,255,0.05)';
  for (const l of world.lamps) {
    if (l.x < v.x0 - 200 || l.x > v.x1 + 200 || l.y < v.y0 - 200 || l.y > v.y1 + 200) continue;
    let onV = false;
    for (const vx of VX) if (Math.abs(l.x - vx) < ROAD_HALF + 10) { onV = true; break; }
    const g = onV
      ? ctx.createLinearGradient(l.x, l.y - 90, l.x, l.y + 110)
      : ctx.createLinearGradient(l.x - 90, l.y, l.x + 110, l.y);
    g.addColorStop(0, 'rgba(150,190,255,0)');
    g.addColorStop(0.5, 'rgba(150,190,255,0.09)');
    g.addColorStop(1, 'rgba(150,190,255,0)');
    ctx.fillStyle = g;
    if (onV) ctx.fillRect(l.x - 26, l.y - 90, 52, 200);
    else ctx.fillRect(l.x - 90, l.y - 26, 200, 52);
  }
  // headlight additive cones
  for (const car of S.cars) {
    if (car.dead) continue;
    if (car.x < v.x0 - 300 || car.x > v.x1 + 300 || car.y < v.y0 - 300 || car.y > v.y1 + 300) continue;
    const ca = Math.cos(car.ang), sa = Math.sin(car.ang);
    ctx.save();
    ctx.translate(car.x + ca * car.spec.l * 0.45, car.y + sa * car.spec.l * 0.45);
    ctx.rotate(car.ang);
    const g = ctx.createLinearGradient(0, 0, 250, 0);
    g.addColorStop(0, 'rgba(255,240,190,0.16)');
    g.addColorStop(1, 'rgba(255,240,190,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(0, -car.spec.w * 0.35);
    ctx.lineTo(250, -95);
    ctx.lineTo(250, 95);
    ctx.lineTo(0, car.spec.w * 0.35);
    ctx.closePath();
    ctx.fill();
    // taillights when braking
    if (car.braking || car.dead) {
      ctx.fillStyle = 'rgba(255,40,40,0.4)';
      ctx.fillRect(-car.spec.l * 0.5 - 4, -car.spec.w * 0.4, 4, 5);
      ctx.fillRect(-car.spec.l * 0.5 - 4, car.spec.w * 0.4 - 5, 4, 5);
    }
    ctx.restore();
  }
  // explosion glow
  for (const e of S.explosions) {
    const lt = e.t / e.max;
    const g = ctx.createRadialGradient(e.x, e.y, 0, e.x, e.y, e.power * 220);
    g.addColorStop(0, `rgba(255,200,90,${0.5 * (1 - lt)})`);
    g.addColorStop(1, 'rgba(255,140,40,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(e.x, e.y, e.power * 220, 0, TAU); ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';
}

function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

// ---------------------------------------------------------------- rain
function drawRain(ctx) {
  if (S.rain < 0.04) return;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const n = Math.floor(S.rain * 220);
  ctx.strokeStyle = `rgba(180,210,255,${0.16 + S.rain * 0.2})`;
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  for (let k = 0; k < n; k++) {
    const x = (hash2(k, 11) * VW + S.time * (320 + hash2(k, 5) * 260)) % VW;
    const y = (hash2(k, 17) * VH + S.time * (560 + hash2(k, 7) * 300)) % VH;
    ctx.moveTo(x, y);
    ctx.lineTo(x - 7, y + 16);
  }
  ctx.stroke();
  // storm vignette
  ctx.fillStyle = `rgba(10,16,34,${S.rain * 0.2})`;
  ctx.fillRect(0, 0, VW, VH);
}

// ---------------------------------------------------------------- screen fx
function screenFx(ctx) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (S.flash > 0) {
    ctx.fillStyle = `rgba(${S.flashCol},${S.flash})`;
    ctx.fillRect(0, 0, VW, VH);
  }
  const p = S.player;
  if (p && p.hp < 35 && S.mode === 'playing') {
    const a = 0.18 + Math.sin(S.time * 6) * 0.06;
    const g = ctx.createRadialGradient(VW / 2, VH / 2, VH * 0.4, VW / 2, VH / 2, VH * 0.75);
    g.addColorStop(0, 'rgba(255,0,0,0)');
    g.addColorStop(1, `rgba(180,0,0,${a})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, VW, VH);
  }
}

// ---------------------------------------------------------------- minimap
export function drawMinimap(ctx, cx, cy, r) {
  const p = S.player;
  if (!p) return;
  const scale = 0.115;
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, TAU);
  ctx.clip();
  ctx.fillStyle = '#10251a';
  ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  const px = p.x, py = p.y;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(scale, scale);
  ctx.translate(-px, -py);
  // zones
  ctx.fillStyle = '#0c2440';
  ctx.fillRect(0, 4400, 6400, 400);
  ctx.fillRect(0, 0, 1820, 260);
  ctx.fillStyle = '#c8b088';
  ctx.fillRect(0, 4182, 6400, 218);
  ctx.fillStyle = '#24512f';
  ctx.fillRect(1932, 2332, 736, 736);
  ctx.fillStyle = '#33363c';
  ctx.fillRect(4740, 240, 1440, 1230);
  ctx.fillStyle = '#3a3f46';
  ctx.fillRect(282, 282, 1616, 872);
  // roads
  ctx.strokeStyle = '#565a62';
  ctx.lineWidth = ROAD_W * 0.8;
  ctx.beginPath();
  for (const vx of VX) { if (Math.abs(vx - px) > r / scale + 60) continue; ctx.moveTo(vx, 250); ctx.lineTo(vx, 4182); }
  for (const hy of HY) { if (Math.abs(hy - py) > r / scale + 60) continue; ctx.moveTo(250, hy); ctx.lineTo(5950, hy); }
  ctx.stroke();
  ctx.restore();
  // blips
  const blip = (wx, wy, col, rr = 4) => {
    const dx = (wx - px) * scale, dy = (wy - py) * scale;
    if (dx * dx + dy * dy > (r - 6) * (r - 6)) {
      const d = Math.hypot(dx, dy);
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.arc(cx + dx / d * (r - 8), cy + dy / d * (r - 8), 3.2, 0, TAU); ctx.fill();
      return;
    }
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.arc(cx + dx, cy + dy, rr, 0, TAU); ctx.fill();
  };
  for (const m of markers()) blip(m.x, m.y, m.kind === 'story' ? '#c060ff' : '#39c8ff', 4.4);
  if (S.mission.blip) blip(S.mission.blip.x, S.mission.blip.y, '#ffd23c', 4.4);
  for (const car of S.cars) if (car.ai === 'police' && !car.dead) blip(car.x, car.y, '#ff4040', 3.4);
  for (const cop of S.cops) if (!cop.dead) blip(cop.x, cop.y, '#ff6050', 2.8);
  if (S.heli) blip(S.heli.x, S.heli.y, '#ff4040', 4.6);
  // player arrow
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(p.inCar ? p.inCar.ang : p.ang);
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(7, 0); ctx.lineTo(-5, -5); ctx.lineTo(-5, 5);
  ctx.closePath(); ctx.fill();
  ctx.restore();
  ctx.restore();
  // frame + north
  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.stroke();
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 12px Arial';
  ctx.textAlign = 'center';
  ctx.fillText('N', cx, cy - r + 14);
  ctx.textAlign = 'left';
}
