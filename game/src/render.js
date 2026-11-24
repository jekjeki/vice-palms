// VICE PALMS — rendering: a static prerendered world layer (ground, roads,
// buildings, beach, docks, airfield) plus a dynamic pass with neon glow,
// headlights, sirens, wet sheen, explosions and the camera.

import { CFG } from './config.js';
import { G } from './state.js';
import { clamp, lerp, TAU } from './util.js';
import { WATER_S, BOARDWALK_Y } from './world.js';
import { activeMarker } from './missions.js';

const SS = 0.5;                       // static-layer downscale
const NEON_GLOW_COLS = ['#ff4fa3', '#3ae7ff', '#ffe36e', '#7dff9e', '#c084ff', '#ff8a5c'];

// ---------------------------------------------------------------------------
// static prerender

export function prerenderWorld(w) {
  const cv = document.createElement('canvas');
  cv.width = Math.ceil(w.W * SS);
  cv.height = Math.ceil(w.H * SS);
  const c = cv.getContext('2d');
  c.scale(SS, SS);

  drawGround(c, w);
  drawRoads(c, w);
  drawStaticBuildings(c, w);
  drawStaticDocks(c, w);
  drawStaticPark(c, w);
  drawStaticBeach(c, w);
  drawStaticAirfield(c, w);
  drawPalmsStatic(c, w);

  w.staticCanvas = cv;

  // minimap base
  const mv = document.createElement('canvas');
  mv.width = 480; mv.height = Math.round(480 * w.H / w.W);
  const m = mv.getContext('2d');
  m.drawImage(cv, 0, 0, mv.width, mv.height);
  w.miniCanvas = mv;
}

function drawGround(c, w) {
  // city base
  c.fillStyle = '#101226';
  c.fillRect(0, 0, w.W, w.H);
  // block interiors slightly lighter
  c.fillStyle = '#151731';
  for (const b of w.buildings) {
    c.fillRect(b.x - 14, b.y - 14, b.w + 28, b.h + 28);
  }
}

function drawRoads(c, w) {
  const RH = CFG.ROAD_HALF, SW = CFG.SIDEWALK;
  // sidewalks
  c.fillStyle = '#2b2e4a';
  for (const x of w.roadsX) c.fillRect(x - RH - SW, 120, (RH + SW) * 2, CFG.BEACH_Y - 110);
  for (const y of w.roadsY) c.fillRect(120, y - RH - SW, CFG.WORLD_W - 240, (RH + SW) * 2);
  // asphalt
  c.fillStyle = '#1a1c30';
  for (const x of w.roadsX) c.fillRect(x - RH, 120, RH * 2, CFG.BEACH_Y - 110);
  for (const y of w.roadsY) c.fillRect(120, y - RH, CFG.WORLD_W - 240, RH * 2);
  // lane dashes
  c.strokeStyle = 'rgba(240,220,140,0.5)';
  c.lineWidth = 3;
  c.setLineDash([26, 30]);
  c.beginPath();
  for (const x of w.roadsX) { c.moveTo(x, 140); c.lineTo(x, CFG.BEACH_Y - 20); }
  for (const y of w.roadsY) { c.moveTo(140, y); c.lineTo(CFG.WORLD_W - 140, y); }
  c.stroke();
  c.setLineDash([]);
  // wet sheen streaks
  c.strokeStyle = 'rgba(150,180,255,0.05)';
  c.lineWidth = 8;
  c.beginPath();
  for (const x of w.roadsX) { c.moveTo(x - 6, 140); c.lineTo(x - 6, CFG.BEACH_Y - 20); c.moveTo(x + 10, 200); c.lineTo(x + 10, CFG.BEACH_Y); }
  for (const y of w.roadsY) { c.moveTo(160, y + 5); c.lineTo(CFG.WORLD_W - 160, y + 5); }
  c.stroke();
  // curbs
  c.strokeStyle = '#3c4064';
  c.lineWidth = 2;
  for (const x of w.roadsX) { c.strokeRect(x - RH - SW, 120, (RH + SW) * 2, CFG.BEACH_Y - 110); }
}

function drawStaticBuildings(c, w) {
  for (const b of w.buildings) {
    // drop shadow
    c.fillStyle = 'rgba(0,0,0,0.45)';
    c.fillRect(b.x + 7, b.y + 9, b.w, b.h);
    // body
    c.fillStyle = b.col;
    c.fillRect(b.x, b.y, b.w, b.h);
    // roof
    c.fillStyle = b.roof;
    c.fillRect(b.x + 5, b.y + 5, b.w - 10, b.h - 10);
    // roof clutter
    c.fillStyle = 'rgba(0,0,0,0.25)';
    c.fillRect(b.x + b.w * 0.25, b.y + b.h * 0.3, b.w * 0.2, b.h * 0.2);
    // neon sign text
    if (b.sign) {
      c.save();
      c.font = 'bold 13px monospace';
      c.textAlign = 'center';
      c.fillStyle = b.neon;
      c.globalAlpha = 0.9;
      c.fillText(b.sign, b.x + b.w / 2, b.y + b.h / 2 + 4);
      c.restore();
    }
  }
}

function drawStaticDocks(c, w) {
  const D = CFG.DOCKS;
  // apron
  c.fillStyle = '#23273a';
  c.fillRect(D.x0 - 40, D.y0 - 10, D.x1 - D.x0 + 80, D.y1 - D.y0 + 40);
  c.strokeStyle = '#3a3f58';
  c.lineWidth = 2;
  c.strokeRect(D.x0 - 40, D.y0 - 10, D.x1 - D.x0 + 80, D.y1 - D.y0 + 40);
  // water (top)
  c.fillStyle = '#0b1530';
  c.fillRect(0, 0, w.W, CFG.WATER_TOP);
  waveStatic(c, CFG.WATER_TOP);
  // piers
  for (const p of w.piers) {
    c.fillStyle = '#3d3428';
    c.fillRect(p.x, p.y, p.w, p.h);
    c.strokeStyle = '#544632';
    c.strokeRect(p.x, p.y, p.w, p.h);
  }
  // containers
  for (const ct of w.containers) {
    c.fillStyle = 'rgba(0,0,0,0.4)';
    c.fillRect(ct.x + 4, ct.y + 5, ct.w, ct.h);
    c.fillStyle = ct.col;
    c.fillRect(ct.x, ct.y, ct.w, ct.h);
    c.strokeStyle = 'rgba(0,0,0,0.35)';
    c.strokeRect(ct.x, ct.y, ct.w, ct.h);
  }
  // cranes
  for (const cr of w.cranes) {
    c.fillStyle = '#c9a02e';
    c.fillRect(cr.x - 20, cr.y - 20, 40, 40);
    c.fillStyle = '#e0b53e';
    c.fillRect(cr.x - 4, cr.y - 20 - cr.arm, 8, cr.arm);
    c.fillRect(cr.x - cr.arm * 0.8, cr.y - 26, cr.arm * 1.6, 7);
  }
  // ship
  if (w.ship) {
    const s = w.ship;
    c.fillStyle = '#12233f';
    c.fillRect(s.x, s.y, s.w, s.h);
    c.fillStyle = '#1d3a5f';
    c.fillRect(s.x + 6, s.y + 6, s.w - 12, s.h - 12);
    c.fillStyle = '#c9a02e';
    c.fillRect(s.x + s.w / 2 - 8, s.y + s.h - 46, 16, 30);
    c.fillStyle = 'rgba(255,255,255,0.5)';
    c.font = 'bold 12px monospace';
    c.textAlign = 'center';
    c.fillText('PALM STAR', s.x + s.w / 2, s.y + s.h / 2);
  }
  // warehouse shed glow text
  for (const b of w.buildings) {
    if (b.sign && b.y < D.y1 + 100) {
      c.save();
      c.font = 'bold 13px monospace';
      c.textAlign = 'center';
      c.fillStyle = b.neon;
      c.fillText(b.sign, b.x + b.w / 2, b.y + b.h / 2 + 4);
      c.restore();
    }
  }
}

function waveStatic(c, yLine) {
  c.strokeStyle = 'rgba(120,170,255,0.25)';
  c.lineWidth = 2;
  c.beginPath();
  for (let x = 0; x < CFG.WORLD_W; x += 90) {
    c.moveTo(x, yLine - 14);
    c.lineTo(x + 34, yLine - 14);
  }
  c.stroke();
}

function drawStaticPark(c, w) {
  const P = CFG.PARK;
  c.fillStyle = '#17321f';
  c.fillRect(P.x0, P.y0, P.x1 - P.x0, P.y1 - P.y0);
  c.strokeStyle = '#25492e';
  c.lineWidth = 3;
  c.strokeRect(P.x0, P.y0, P.x1 - P.x0, P.y1 - P.y0);
  // paths
  c.strokeStyle = '#3a3f58';
  c.lineWidth = 10;
  c.beginPath();
  c.moveTo(P.x0, (P.y0 + P.y1) / 2); c.lineTo(P.x1, (P.y0 + P.y1) / 2);
  c.moveTo((P.x0 + P.x1) / 2, P.y0); c.lineTo((P.x0 + P.x1) / 2, P.y1);
  c.stroke();
  // pond
  if (w.parkPond) {
    const pd = w.parkPond;
    c.fillStyle = '#0b1530';
    c.beginPath();
    c.ellipse(pd.x, pd.y, pd.rx, pd.ry, 0, 0, TAU);
    c.fill();
    c.strokeStyle = 'rgba(120,170,255,0.3)';
    c.stroke();
  }
}

function drawStaticBeach(c, w) {
  // sand
  const g = c.createLinearGradient(0, CFG.BEACH_Y, 0, WATER_S);
  g.addColorStop(0, '#c8b07a');
  g.addColorStop(1, '#b89b62');
  c.fillStyle = g;
  c.fillRect(0, CFG.BEACH_Y, w.W, WATER_S - CFG.BEACH_Y);
  // boardwalk
  c.fillStyle = '#3d3428';
  c.fillRect(0, BOARDWALK_Y - 16, w.W, 32);
  c.strokeStyle = '#544632';
  c.lineWidth = 2;
  for (let x = 0; x < w.W; x += 26) { c.beginPath(); c.moveTo(x, BOARDWALK_Y - 16); c.lineTo(x, BOARDWALK_Y + 16); c.stroke(); }
  // Ocean Drive asphalt over the sand
  c.fillStyle = '#1a1c30';
  const oy = 3040;
  c.fillRect(120, oy - CFG.ROAD_HALF, CFG.WORLD_W - 240, CFG.ROAD_HALF * 2);
  c.strokeStyle = 'rgba(240,220,140,0.5)';
  c.lineWidth = 3;
  c.setLineDash([26, 30]);
  c.beginPath(); c.moveTo(140, oy); c.lineTo(CFG.WORLD_W - 140, oy); c.stroke();
  c.setLineDash([]);
  // south water
  c.fillStyle = '#0b1530';
  c.fillRect(0, WATER_S, w.W, w.H - WATER_S);
  c.strokeStyle = 'rgba(120,170,255,0.25)';
  c.lineWidth = 2;
  c.beginPath();
  for (let x = 0; x < w.W; x += 80) { c.moveTo(x, WATER_S + 20); c.lineTo(x + 30, WATER_S + 20); }
  c.stroke();
  // east water
  c.fillStyle = '#0b1530';
  c.fillRect(CFG.WATER_RIGHT, 0, w.W - CFG.WATER_RIGHT, CFG.BEACH_Y);
}

function drawStaticAirfield(c, w) {
  const A = CFG.AIRFIELD;
  c.fillStyle = '#1d202e';
  c.fillRect(A.x0, A.y0, A.x1 - A.x0, A.y1 - A.y0);
  if (w.runway) {
    const r = w.runway;
    c.fillStyle = '#2b2f3a';
    c.fillRect(r.x, r.y, r.w, r.h);
    c.strokeStyle = 'rgba(240,240,255,0.5)';
    c.lineWidth = 3;
    c.setLineDash([40, 34]);
    c.beginPath(); c.moveTo(r.x + 20, r.y + r.h / 2); c.lineTo(r.x + r.w - 20, r.y + r.h / 2); c.stroke();
    c.setLineDash([]);
  }
  for (const b of w.buildings) {
    if (b.y >= A.y0 - 10 && b.y <= A.y1) {
      c.fillStyle = 'rgba(0,0,0,0.45)';
      c.fillRect(b.x + 7, b.y + 9, b.w, b.h);
      c.fillStyle = b.col; c.fillRect(b.x, b.y, b.w, b.h);
      c.fillStyle = b.roof; c.fillRect(b.x + 5, b.y + 5, b.w - 10, b.h - 10);
      if (b.sign) {
        c.font = 'bold 13px monospace'; c.textAlign = 'center';
        c.fillStyle = b.neon;
        c.fillText(b.sign, b.x + b.w / 2, b.y + b.h / 2 + 4);
      }
    }
  }
}

function drawPalmsStatic(c, w) {
  for (const p of w.palms) drawPalm(c, p.x, p.y, p.s);
}

function drawPalm(c, x, y, s) {
  c.fillStyle = 'rgba(0,0,0,0.35)';
  c.beginPath(); c.ellipse(x + 6 * s, y + 8 * s, 14 * s, 6 * s, 0, 0, TAU); c.fill();
  c.strokeStyle = '#6e5230';
  c.lineWidth = 4 * s;
  c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x + 4 * s, y - 10 * s, x + 8 * s, y - 18 * s); c.stroke();
  const tx = x + 8 * s, ty = y - 18 * s;
  c.strokeStyle = '#2e7d4f';
  c.lineWidth = 3 * s;
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU + 0.3;
    c.beginPath(); c.moveTo(tx, ty);
    c.quadraticCurveTo(tx + Math.cos(a) * 16 * s, ty + Math.sin(a) * 16 * s - 4 * s, tx + Math.cos(a) * 22 * s, ty + Math.sin(a) * 22 * s + 6 * s);
    c.stroke();
  }
  c.fillStyle = '#3aa14a';
  c.beginPath(); c.arc(tx, ty, 4 * s, 0, TAU); c.fill();
}

// ---------------------------------------------------------------------------
// dynamic frame

export function draw(dt) {
  const ctx = G.ctx;
  const w = G.world;
  if (!w || !w.staticCanvas) { ctx.fillStyle = '#05060f'; ctx.fillRect(0, 0, G.W, G.H); return; }

  const shakeX = (Math.random() - 0.5) * G.shake;
  const shakeY = (Math.random() - 0.5) * G.shake;
  const camX = G.cam.x - G.W / 2 + shakeX;
  const camY = G.cam.y - G.H / 2 + shakeY;

  ctx.save();
  ctx.imageSmoothingEnabled = false;

  // static layer
  const sx = clamp(camX, 0, w.W - G.W), sy = clamp(camY, 0, w.H - G.H);
  ctx.drawImage(w.staticCanvas, sx * SS, sy * SS, G.W * SS, G.H * SS, 0, 0, G.W, G.H);

  ctx.translate(-sx, -sy);
  ctx.imageSmoothingEnabled = true;

  drawWaterShimmer(ctx, sx, sy);
  drawLampGlows(ctx, w, sx, sy);
  drawNeonGlow(ctx, w, sx, sy);
  drawMarkers(ctx, sx, sy);
  drawPickups(ctx);
  drawSkids(ctx);
  drawCars(ctx, w);
  drawPeds(ctx);
  drawPlayer(ctx);
  drawBullets(ctx);
  drawParticles(ctx);
  drawFlashes(ctx);
  drawPropsDynamic(ctx, w, sx, sy);

  ctx.restore();

  drawNightOverlay(ctx);
  drawWetSheen(ctx);
  drawVignette(ctx);
}

function visible(x, y, m, s) {
  return x > s.x - m && x < s.x + G.W + m && y > s.y - m && y < s.y + G.H + m;
}

function drawWaterShimmer(ctx, sx, sy) {
  const t = G.time;
  ctx.strokeStyle = 'rgba(140,190,255,0.16)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = 0; i < 22; i++) {
    const x = sx + ((i * 137 + t * 30) % (G.W + 80)) - 40;
    const yTop = (i % 2 === 0) ? 40 + (i % 3) * 20 : WATER_S + 24 + (i % 4) * 22;
    if (yTop < CFG.WATER_TOP || yTop > WATER_S - 8) {}
    ctx.moveTo(x, yTop); ctx.lineTo(x + 30, yTop);
  }
  ctx.stroke();
}

function drawLampGlows(ctx, w, sx, sy) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const pr of w.props) {
    if (pr.kind !== 'lamp') continue;
    if (!visible(pr.x, pr.y, 90, { x: sx, y: sy })) continue;
    const g = ctx.createRadialGradient(pr.x, pr.y, 4, pr.x, pr.y, 64);
    g.addColorStop(0, 'rgba(255,220,140,0.28)');
    g.addColorStop(1, 'rgba(255,220,140,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(pr.x, pr.y, 64, 0, TAU); ctx.fill();
  }
  ctx.restore();
}

function drawNeonGlow(ctx, w, sx, sy) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const b of w.buildings) {
    if (!b.neon) continue;
    if (!visible(b.x + b.w / 2, b.y + b.h / 2, Math.max(b.w, b.h) + 60, { x: sx, y: sy })) continue;
    const pulse = 0.75 + 0.25 * Math.sin(G.time * 2.2 + b.x * 0.13);
    ctx.strokeStyle = b.neon;
    ctx.globalAlpha = 0.35 * pulse;
    ctx.lineWidth = 3;
    ctx.shadowColor = b.neon;
    ctx.shadowBlur = 18;
    ctx.strokeRect(b.x + 4, b.y + 4, b.w - 8, b.h - 8);
    if (b.sign) {
      ctx.globalAlpha = 0.5 * pulse;
      ctx.font = 'bold 13px monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = b.neon;
      ctx.shadowBlur = 14;
      ctx.fillText(b.sign, b.x + b.w / 2, b.y + b.h / 2 + 4);
    }
  }
  ctx.restore();
}

function drawMarkers(ctx, sx, sy) {
  const mk = activeMarker();
  if (mk) {
    const pulse = 0.5 + 0.5 * Math.sin(G.time * 4);
    ctx.save();
    // beam
    const g = ctx.createRadialGradient(mk.x, mk.y, 4, mk.x, mk.y, CFG.MARKER_R + 10);
    g.addColorStop(0, mk.col + '');
    ctx.globalAlpha = 0.25 + pulse * 0.25;
    ctx.fillStyle = mk.col;
    ctx.beginPath(); ctx.arc(mk.x, mk.y, CFG.MARKER_R + 8 * pulse, 0, TAU); ctx.fill();
    ctx.globalAlpha = 0.9;
    ctx.strokeStyle = mk.col;
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(mk.x, mk.y, CFG.MARKER_R, 0, TAU); ctx.stroke();
    // upward beam
    const bg = ctx.createLinearGradient(mk.x, mk.y - 120, mk.x, mk.y);
    bg.addColorStop(0, 'rgba(255,255,255,0)');
    bg.addColorStop(1, mk.col + '');
    ctx.globalAlpha = 0.16;
    ctx.fillStyle = bg;
    ctx.fillRect(mk.x - 10, mk.y - 120, 20, 120);
    ctx.restore();
  }
  // checkpoints
  const m = G.mission;
  if (m && m.checkpoints.length && m.def.steps[m.step] && m.def.steps[m.step].type === 'checkpoints') {
    for (let i = 0; i < m.checkpoints.length; i++) {
      const c = m.checkpoints[i];
      if (i < m.data.cp) continue;
      const isNext = i === m.data.cp;
      ctx.save();
      ctx.globalAlpha = isNext ? 0.85 : 0.25;
      ctx.strokeStyle = '#5ad0ff';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(c.x, c.y, isNext ? 34 : 20, 0, TAU); ctx.stroke();
      ctx.restore();
    }
  }
}

function drawPickups(ctx) {
  for (const pk of G.pickups) {
    const bob = Math.sin(G.time * 3 + pk.x) * 3;
    ctx.save();
    ctx.translate(pk.x, pk.y + bob);
    ctx.fillStyle = '#ffe36e';
    ctx.fillRect(-8, -6, 16, 12);
    ctx.strokeStyle = '#fff6c8';
    ctx.lineWidth = 2;
    ctx.strokeRect(-8, -6, 16, 12);
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = '#ffe36e';
    ctx.beginPath(); ctx.arc(0, 0, 18, 0, TAU); ctx.fill();
    ctx.restore();
  }
}

function drawSkids(ctx) {
  for (const c of G.cars) {
    if (c.skid <= 0.02) continue;
    const fx = Math.cos(c.ang), fy = Math.sin(c.ang);
    const wx = -fy, wy = fx;
    for (const s of [-1, 1]) {
      const ax = c.x + fx * c.type.w * 0.3 + wx * s * c.type.h * 0.36;
      const ay = c.y + fy * c.type.w * 0.3 + wy * s * c.type.h * 0.36;
      const bx = ax - fx * 16, by = ay - fy * 16;
      ctx.strokeStyle = 'rgba(20,20,26,' + (0.5 * c.skid) + ')';
      ctx.lineWidth = 5;
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
    }
  }
}

function drawCars(ctx, w) {
  for (const c of G.cars) {
    if (!visible(c.x, c.y, 80, { x: G.cam.x - G.W / 2, y: G.cam.y - G.H / 2 })) continue;
    drawCar(ctx, c);
  }
}

function drawCar(ctx, c) {
  const t = c.type;
  ctx.save();
  ctx.translate(c.x, c.y);
  ctx.rotate(c.ang);

  // shadow
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  roundRect(ctx, -t.w / 2 + 4, -t.h / 2 + 5, t.w, t.h, 6);
  ctx.fill();

  // headlight cones (night)
  if (c.headlights && !c.dead) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(t.w * 0.45, 0, 4, t.w * 0.45, 0, 130);
    g.addColorStop(0, 'rgba(255,240,190,0.35)');
    g.addColorStop(1, 'rgba(255,240,190,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(t.w * 0.42, -t.h * 0.3);
    ctx.lineTo(t.w * 0.42 + 150, -46);
    ctx.lineTo(t.w * 0.42 + 150, 46);
    ctx.lineTo(t.w * 0.42, t.h * 0.3);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // body
  ctx.fillStyle = c.dead ? '#26262c' : c.color;
  roundRect(ctx, -t.w / 2, -t.h / 2, t.w, t.h, 5);
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.55)';
  ctx.lineWidth = 2;
  roundRect(ctx, -t.w / 2, -t.h / 2, t.w, t.h, 5);
  ctx.stroke();

  // cabin
  ctx.fillStyle = c.dead ? '#1a1a1f' : 'rgba(20,26,40,0.9)';
  roundRect(ctx, -t.w * 0.18, -t.h * 0.34, t.w * 0.42, t.h * 0.68, 3);
  ctx.fill();
  ctx.fillStyle = 'rgba(140,180,230,0.35)';
  roundRect(ctx, t.w * 0.1, -t.h * 0.28, t.w * 0.12, t.h * 0.56, 2);
  ctx.fill();

  // stripes for taxi/cop
  if (t.taxi && !c.dead) {
    ctx.fillStyle = '#111';
    ctx.fillRect(-t.w * 0.05, -t.h / 2, 4, t.h);
  }
  if (t.cop && !c.dead) {
    ctx.fillStyle = '#e8e8ee';
    ctx.fillRect(-t.w / 2 + 2, -t.h / 2, t.w * 0.35, 4);
    ctx.fillRect(-t.w / 2 + 2, t.h / 2 - 4, t.w * 0.35, 4);
    // lightbar
    const flash = Math.floor(G.time * 8) % 2 === 0;
    ctx.fillStyle = flash ? '#ff3040' : '#2040ff';
    ctx.fillRect(-6, -t.h * 0.28, 5, t.h * 0.56);
    ctx.fillStyle = flash ? '#2040ff' : '#ff3040';
    ctx.fillRect(1, -t.h * 0.28, 5, t.h * 0.56);
  }

  // brake / reverse lights
  if (!c.dead) {
    const braking = c.throttle < 0;
    ctx.fillStyle = braking ? '#ff4040' : 'rgba(255,60,60,0.35)';
    ctx.fillRect(-t.w / 2, -t.h * 0.38, 4, t.h * 0.28);
    ctx.fillRect(-t.w / 2, t.h * 0.1, 4, t.h * 0.28);
    ctx.fillStyle = 'rgba(255,250,220,0.8)';
    ctx.fillRect(t.w / 2 - 3, -t.h * 0.36, 3, t.h * 0.24);
    ctx.fillRect(t.w / 2 - 3, t.h * 0.12, 3, t.h * 0.24);
  }

  // driver silhouette
  if (c.driver === 'player' && !c.dead) {
    ctx.fillStyle = '#e8b88a';
    ctx.beginPath(); ctx.arc(-t.w * 0.05, -t.h * 0.14, 3.4, 0, TAU); ctx.fill();
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

function drawPeds(ctx) {
  for (const pd of G.peds) {
    if (!visible(pd.x, pd.y, 30, { x: G.cam.x - G.W / 2, y: G.cam.y - G.H / 2 })) continue;
    drawPerson(ctx, pd.x, pd.y, pd.ang, pd.shirt, pd.dead, pd.walkT, pd.gang ? '#3aa14a' : null);
  }
  for (const cop of G.cops) {
    if (!visible(cop.x, cop.y, 30, { x: G.cam.x - G.W / 2, y: G.cam.y - G.H / 2 })) continue;
    drawPerson(ctx, cop.x, cop.y, cop.dead ? cop.ang : cop.aimT, '#2f5f9e', cop.dead, cop.walkT || 0, '#1e3a5c');
    if (!cop.dead) {
      // pistol
      ctx.strokeStyle = '#20242c';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(cop.x + Math.cos(cop.aimT) * 8, cop.y + Math.sin(cop.aimT) * 8);
      ctx.lineTo(cop.x + Math.cos(cop.aimT) * 15, cop.y + Math.sin(cop.aimT) * 15);
      ctx.stroke();
    }
  }
}

function drawPerson(ctx, x, y, ang, shirt, dead, walkT, trim) {
  if (dead) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(ang);
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath(); ctx.ellipse(0, 2, 12, 6, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = shirt;
    ctx.beginPath(); ctx.ellipse(0, 0, 10, 5, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#e8b88a';
    ctx.beginPath(); ctx.arc(9, 0, 3.4, 0, TAU); ctx.fill();
    ctx.restore();
    return;
  }
  const bob = Math.sin(walkT * 2) * 1.5;
  ctx.save();
  ctx.translate(x, y);
  // shadow
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.beginPath(); ctx.ellipse(2, 3, 8, 5, 0, 0, TAU); ctx.fill();
  ctx.rotate(ang);
  // feet
  ctx.fillStyle = '#20242c';
  ctx.fillRect(2, -5 + bob, 4, 3);
  ctx.fillRect(2, 2 - bob, 4, 3);
  // torso
  ctx.fillStyle = shirt;
  ctx.beginPath(); ctx.ellipse(0, 0, 6.5, 5, 0, 0, TAU); ctx.fill();
  if (trim) { ctx.strokeStyle = trim; ctx.lineWidth = 1.4; ctx.stroke(); }
  // head
  ctx.fillStyle = '#e8b88a';
  ctx.beginPath(); ctx.arc(2, 0, 3.4, 0, TAU); ctx.fill();
  ctx.restore();
}

function drawPlayer(ctx) {
  const p = G.player;
  if (p.car) return; // in car
  drawPerson(ctx, p.x, p.y, p.ang, p.hurtT > 0 ? '#ff6e6e' : '#e8e8ee', false, p.walkT, '#c0392b');

  // weapon
  if (p.weapon === 'pistol') {
    ctx.strokeStyle = '#20242c';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(p.x + Math.cos(p.ang) * 8, p.y + Math.sin(p.ang) * 8);
    ctx.lineTo(p.x + Math.cos(p.ang) * 16, p.y + Math.sin(p.ang) * 16);
    ctx.stroke();
  }
  if (p.punchT > 0) {
    ctx.strokeStyle = 'rgba(255,230,150,0.8)';
    ctx.lineWidth = 2;
    const r = CFG.PUNCH_RANGE * (1 - p.punchT / 0.22) + 12;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, p.ang - 0.6, p.ang + 0.6);
    ctx.stroke();
  }
}

function drawBullets(ctx) {
  ctx.strokeStyle = '#ffe9a8';
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (const b of G.bullets) {
    ctx.moveTo(b.x, b.y);
    ctx.lineTo(b.x - b.vx * 0.02, b.y - b.vy * 0.02);
  }
  ctx.stroke();
}

function drawParticles(ctx) {
  for (const p of G.parts) {
    const a = clamp(p.life / p.maxLife, 0, 1);
    ctx.globalAlpha = a;
    if (p.kind === 'ring') {
      ctx.strokeStyle = p.col;
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, TAU); ctx.stroke();
    } else {
      ctx.fillStyle = p.col;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, TAU); ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
}

function drawFlashes(ctx) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const f of G.flashes) {
    const a = f.t / f.max;
    const g = ctx.createRadialGradient(f.x, f.y, 4, f.x, f.y, f.r * (1.4 - a * 0.4));
    g.addColorStop(0, 'rgba(255,240,190,' + (0.8 * a) + ')');
    g.addColorStop(0.4, 'rgba(255,160,60,' + (0.45 * a) + ')');
    g.addColorStop(1, 'rgba(255,120,30,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(f.x, f.y, f.r * 1.4, 0, TAU); ctx.fill();
  }
  ctx.restore();
}

function drawPropsDynamic(ctx, w, sx, sy) {
  // lamp posts + umbrellas + benches (dynamic so they sit above cars/peds a little)
  for (const pr of w.props) {
    if (!visible(pr.x, pr.y, 40, { x: sx, y: sy })) continue;
    if (pr.kind === 'lamp') {
      ctx.fillStyle = '#3a3f58';
      ctx.fillRect(pr.x - 2, pr.y - 2, 4, 4);
      ctx.fillStyle = '#ffe9a8';
      ctx.beginPath(); ctx.arc(pr.x, pr.y, 2.6, 0, TAU); ctx.fill();
    } else if (pr.kind === 'umbrella') {
      ctx.fillStyle = pr.col;
      ctx.globalAlpha = 0.85;
      ctx.beginPath(); ctx.arc(pr.x, pr.y, 9, 0, TAU); ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#e8e8ee';
      ctx.beginPath(); ctx.arc(pr.x, pr.y, 2.5, 0, TAU); ctx.fill();
    } else if (pr.kind === 'bench') {
      ctx.fillStyle = '#544632';
      ctx.fillRect(pr.x - 8, pr.y - 3, 16, 6);
    } else if (pr.kind === 'hydrant') {
      ctx.fillStyle = '#c0392b';
      ctx.beginPath(); ctx.arc(pr.x, pr.y, 3.4, 0, TAU); ctx.fill();
    } else if (pr.kind === 'fence') {
      ctx.strokeStyle = '#5a5f7a';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(pr.x, pr.y - 8); ctx.lineTo(pr.x, pr.y); ctx.stroke();
    }
  }
  // beach umbrellas drawn above sand but below peds — acceptable
}

function drawNightOverlay(ctx) {
  // cool night wash
  ctx.fillStyle = 'rgba(8,10,38,0.12)';
  ctx.fillRect(0, 0, G.W, G.H);
}

function drawWetSheen(ctx) {
  const t = G.time;
  ctx.save();
  ctx.globalAlpha = 0.05;
  ctx.strokeStyle = '#9fc4ff';
  ctx.lineWidth = 30;
  for (let i = 0; i < 3; i++) {
    const y = ((t * 24 + i * 300) % (G.H + 300)) - 150;
    ctx.beginPath();
    ctx.moveTo(-50, y);
    ctx.lineTo(G.W + 50, y + 60);
    ctx.stroke();
  }
  ctx.restore();
}

function drawVignette(ctx) {
  const g = ctx.createRadialGradient(G.W / 2, G.H / 2, G.H * 0.42, G.W / 2, G.H / 2, G.H * 0.85);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(2,3,12,0.55)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, G.W, G.H);
  if (G.player.hurtT > 0) {
    ctx.fillStyle = 'rgba(200,20,40,' + (0.25 * G.player.hurtT / 0.35) + ')';
    ctx.fillRect(0, 0, G.W, G.H);
  }
}
