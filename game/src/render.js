// render.js — the full night-city painter: ground, roads with wet sheen,
// districts (docks, airfield, park, beach), 2.5D buildings with neon, entities,
// headlights, explosions with flash + shake, particles, night grade.

import { CFG } from './config.js';
import { clamp, TAU, rectsOverlap, aabbOf } from './util.js';
import { ROAD_V, ROAD_H, V_SPAN, H_SPAN, PARK, DOCKS, AIRFIELD, RUNWAY, WATER, SAND } from './world.js';

let view = { x0: 0, y0: 0, x1: 0, y1: 0 };

export function render(g, ctx) {
  const cam = g.cam;
  const zoom = cam.zoom;
  const shx = (Math.random() - 0.5) * cam.shake;
  const shy = (Math.random() - 0.5) * cam.shake;

  ctx.save();
  ctx.fillStyle = CFG.ASPHALT;
  ctx.fillRect(0, 0, CFG.VIEW_W, CFG.VIEW_H);

  ctx.translate(CFG.VIEW_W / 2, CFG.VIEW_H / 2);
  ctx.scale(zoom, zoom);
  ctx.translate(-cam.x + shx, -cam.y + shy);

  const halfW = CFG.VIEW_W / (2 * zoom) + 80;
  const halfH = CFG.VIEW_H / (2 * zoom) + 80;
  view = { x0: cam.x - halfW, y0: cam.y - halfH, x1: cam.x + halfW, y1: cam.y + halfH };

  drawGround(g, ctx);
  drawRoads(g, ctx);
  drawDistricts(g, ctx);
  drawDecals(g, ctx);
  drawMarkers(g, ctx);
  drawPropsLow(g, ctx);          // palms + benches behind entities
  drawHeadlights(g, ctx);
  drawPeds(g, ctx);
  drawCars(g, ctx);
  drawPlayer(g, ctx);
  drawBullets(g, ctx);
  drawBuildings(g, ctx);
  drawPropsHigh(g, ctx);         // cranes, tower mast above roofs
  drawParticles(g, ctx);
  drawExplosions(g, ctx);
  drawWetSheen(g, ctx);
  drawNightGrade(g, ctx);

  ctx.restore();

  // screen-space explosion flash
  if (g.cam.flash > 0.01) {
    ctx.fillStyle = `rgba(255,244,214,${clamp(g.cam.flash, 0, 0.85)})`;
    ctx.fillRect(0, 0, CFG.VIEW_W, CFG.VIEW_H);
  }
}

// ------------------------------------------------------------------ ground

function drawGround(g, ctx) {
  // sand first
  ctx.fillStyle = CFG.SAND;
  for (const s of SAND) ctx.fillRect(s.x, s.y, s.w, s.h);
  // grass for park + airfield apron
  ctx.fillStyle = CFG.GRASS;
  ctx.fillRect(PARK.x, PARK.y, PARK.w, PARK.h);
  ctx.fillRect(AIRFIELD.x, AIRFIELD.y, AIRFIELD.w, AIRFIELD.h);
  ctx.fillStyle = CFG.GRASS_HI;
  for (let i = 0; i < 14; i++) {
    const gx = PARK.x + ((i * 137) % (PARK.w - 60));
    const gy = PARK.y + ((i * 271) % (PARK.h - 40));
    ctx.fillRect(gx, gy, 30, 6);
  }
  // water with animated waves
  ctx.fillStyle = CFG.WATER;
  for (const w of WATER) ctx.fillRect(w.x, w.y, w.w, w.h);
  ctx.strokeStyle = 'rgba(90,170,220,0.18)';
  ctx.lineWidth = 2;
  const t = g.time;
  ctx.beginPath();
  for (const w of WATER) {
    const y0 = Math.max(w.y, view.y0), y1 = Math.min(w.y + w.h, view.y1);
    const x0 = Math.max(w.x, view.x0), x1 = Math.min(w.x + w.w, view.x1);
    for (let y = y0 + 20; y < y1; y += 46) {
      for (let x = x0 + ((y * 7) % 60); x < x1; x += 60) {
        const ph = Math.sin(t * 1.4 + x * 0.02 + y * 0.03) * 4;
        ctx.moveTo(x, y + ph);
        ctx.lineTo(x + 22, y + ph);
      }
    }
  }
  ctx.stroke();
}

// ------------------------------------------------------------------ roads

function drawRoads(g, ctx) {
  // sidewalk plates for each block
  ctx.fillStyle = CFG.SIDEWALK_COL;
  const inset = CFG.ROAD_HALF + CFG.SIDEWALK;
  for (let i = 0; i < ROAD_V.length - 1; i++) {
    for (let j = 0; j < ROAD_H.length - 1; j++) {
      const bx = ROAD_V[i] + inset, by = ROAD_H[j] + inset;
      const bw = ROAD_V[i + 1] - ROAD_V[i] - inset * 2;
      const bh = ROAD_H[j + 1] - ROAD_H[j] - inset * 2;
      if (bw < 10 || bh < 10) continue;
      if (!vis(bx, by, bw, bh)) continue;
      ctx.fillRect(bx, by, bw, bh);
    }
  }

  // asphalt strips
  ctx.fillStyle = CFG.ROAD;
  for (const vx of ROAD_V) {
    if (vx + CFG.ROAD_HALF < view.x0 || vx - CFG.ROAD_HALF > view.x1) continue;
    ctx.fillRect(vx - CFG.ROAD_HALF, V_SPAN.min, CFG.ROAD_HALF * 2, V_SPAN.max - V_SPAN.min);
  }
  for (const hy of ROAD_H) {
    if (hy + CFG.ROAD_HALF < view.y0 || hy - CFG.ROAD_HALF > view.y1) continue;
    ctx.fillRect(H_SPAN.min, hy - CFG.ROAD_HALF, H_SPAN.max - H_SPAN.min, CFG.ROAD_HALF * 2);
  }

  // lane dashes: yellow center, white edges
  ctx.setLineDash([CFG.DASH_LEN, CFG.DASH_GAP]);
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(216,200,74,0.75)';
  ctx.beginPath();
  for (const vx of ROAD_V) {
    if (vx < view.x0 - 10 || vx > view.x1 + 10) continue;
    ctx.moveTo(vx, V_SPAN.min);
    ctx.lineTo(vx, V_SPAN.max);
  }
  for (const hy of ROAD_H) {
    if (hy < view.y0 - 10 || hy > view.y1 + 10) continue;
    ctx.moveTo(H_SPAN.min, hy);
    ctx.lineTo(H_SPAN.max, hy);
  }
  ctx.stroke();
  ctx.setLineDash([]);

  // white edge lines
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(220,225,235,0.22)';
  ctx.beginPath();
  for (const vx of ROAD_V) {
    if (vx + CFG.ROAD_HALF < view.x0 || vx - CFG.ROAD_HALF > view.x1) continue;
    ctx.moveTo(vx - CFG.ROAD_HALF + 3, V_SPAN.min);
    ctx.lineTo(vx - CFG.ROAD_HALF + 3, V_SPAN.max);
    ctx.moveTo(vx + CFG.ROAD_HALF - 3, V_SPAN.min);
    ctx.lineTo(vx + CFG.ROAD_HALF - 3, V_SPAN.max);
  }
  for (const hy of ROAD_H) {
    if (hy + CFG.ROAD_HALF < view.y0 || hy - CFG.ROAD_HALF > view.y1) continue;
    ctx.moveTo(H_SPAN.min, hy - CFG.ROAD_HALF + 3);
    ctx.lineTo(H_SPAN.max, hy - CFG.ROAD_HALF + 3);
    ctx.moveTo(H_SPAN.min, hy + CFG.ROAD_HALF - 3);
    ctx.lineTo(H_SPAN.max, hy + CFG.ROAD_HALF - 3);
  }
  ctx.stroke();

  // runway markings
  const R = RUNWAY;
  if (vis(R.x, R.y, R.w, R.h)) {
    ctx.fillStyle = '#2e3138';
    ctx.fillRect(R.x, R.y, R.w, R.h);
    ctx.fillStyle = 'rgba(235,235,240,0.8)';
    for (let x = R.x + 40; x < R.x + R.w - 40; x += 90) ctx.fillRect(x, R.y + R.h / 2 - 2, 50, 4);
    ctx.fillRect(R.x + 8, R.y + 10, 3, R.h - 20);
    ctx.fillRect(R.x + R.w - 11, R.y + 10, 3, R.h - 20);
    ctx.font = 'bold 40px sans-serif';
    ctx.fillStyle = 'rgba(235,235,240,0.55)';
    ctx.fillText('09', R.x + 30, R.y + 52);
  }
}

function vis(x, y, w, h) {
  return x < view.x1 && x + w > view.x0 && y < view.y1 && y + h > view.y0;
}

// ------------------------------------------------------------------ districts

function drawDistricts(g, ctx) {
  // park pond + paths
  if (vis(PARK.x, PARK.y, PARK.w, PARK.h)) {
    ctx.fillStyle = 'rgba(220,214,160,0.25)';
    ctx.fillRect(PARK.x + PARK.w / 2 - 16, PARK.y, 32, PARK.h);
    ctx.fillRect(PARK.x, PARK.y + PARK.h / 2 - 16, PARK.w, 32);
    if (g.world.pond) {
      const P = g.world.pond;
      ctx.fillStyle = CFG.WATER;
      ctx.fillRect(P.x, P.y, P.w, P.h);
      ctx.strokeStyle = 'rgba(90,170,220,0.3)';
      ctx.strokeRect(P.x + 4, P.y + 4, P.w - 8, P.h - 8);
    }
  }

  // docks: piers, containers, ship, gate
  for (const p of g.world.piers) {
    if (!vis(p.x, p.y, p.w, p.h)) continue;
    ctx.fillStyle = '#4a3b28';
    ctx.fillRect(p.x, p.y, p.w, p.h);
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 2;
    for (let y = p.y + 12; y < p.y + p.h; y += 24) {
      ctx.beginPath();
      ctx.moveTo(p.x, y);
      ctx.lineTo(p.x + p.w, y);
      ctx.stroke();
    }
  }
  for (const c of g.world.containers) {
    if (!vis(c.x, c.y, c.w, c.h)) continue;
    ctx.fillStyle = c.col;
    ctx.fillRect(c.x, c.y, c.w, c.h);
    ctx.strokeStyle = 'rgba(0,0,0,0.4)';
    ctx.strokeRect(c.x + 2, c.y + 2, c.w - 4, c.h - 4);
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(c.x + 4, c.y + 4, c.w - 8, 5);
  }
  drawShip(g, ctx);
  // gate barrier stripes
  for (const pr of g.world.props) {
    if (pr.kind === 'gate' && vis(pr.x - 40, pr.y - 10, 80, 20)) {
      ctx.fillStyle = '#c8b44a';
      for (let i = 0; i < 6; i++) ctx.fillRect(pr.x - 36 + i * 13, pr.y - 4, 7, 8);
    }
  }

  // airfield hangars + taxiway
  for (const hgg of g.world.hangars) {
    if (!vis(hgg.x, hgg.y, hgg.w, hgg.h)) continue;
    ctx.fillStyle = hgg.col || '#3a3f4c';
    ctx.fillRect(hgg.x, hgg.y, hgg.w, hgg.h);
    ctx.fillStyle = 'rgba(255,255,255,0.07)';
    ctx.fillRect(hgg.x, hgg.y, hgg.w, 14);
    ctx.strokeStyle = 'rgba(0,0,0,0.4)';
    ctx.strokeRect(hgg.x, hgg.y, hgg.w, hgg.h);
    // door stripe
    ctx.fillStyle = '#23262e';
    ctx.fillRect(hgg.x + 10, hgg.y + hgg.h - 16, hgg.w - 20, 12);
  }
}

function drawShip(g, ctx) {
  const S = g.world.ship;
  if (!vis(S.x, S.y, S.w, S.h)) return;
  ctx.fillStyle = '#20242e';
  ctx.fillRect(S.x, S.y, S.w, S.h);
  ctx.fillStyle = '#2e3442';
  ctx.fillRect(S.x + 10, S.y + 10, S.w - 20, S.h - 20);
  // deck containers
  ctx.fillStyle = '#8a3b46';
  ctx.fillRect(S.x + 40, S.y + 20, 80, 26);
  ctx.fillStyle = '#2f5f8a';
  ctx.fillRect(S.x + 140, S.y + 20, 80, 26);
  ctx.fillStyle = '#c8a23c';
  ctx.fillRect(S.x + 240, S.y + 20, 80, 26);
  // bridge
  ctx.fillStyle = '#3a4152';
  ctx.fillRect(S.x + S.w - 70, S.y + S.h - 46, 46, 36);
  ctx.fillStyle = 'rgba(255,220,140,0.8)';
  ctx.fillRect(S.x + S.w - 62, S.y + S.h - 40, 30, 10);
  // lights
  ctx.fillStyle = '#ff5a5a';
  ctx.fillRect(S.x + 4, S.y + 4, 4, 4);
}

// ------------------------------------------------------------------ decals

function drawDecals(g, ctx) {
  for (const d of g.decals) {
    if (d.life <= 0) continue;
    if (!vis(d.x - d.r, d.y - d.r, d.r * 2, d.r * 2)) continue;
    ctx.globalAlpha = clamp(d.life / 6, 0.15, 1);
    ctx.fillStyle = d.col;
    ctx.beginPath();
    ctx.arc(d.x, d.y, d.r, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}

// ------------------------------------------------------------------ markers

function drawMarkers(g, ctx) {
  const t = g.time;
  for (const m of g.markers) {
    if (!vis(m.x - m.r, m.y - m.r, m.r * 2, m.r * 2)) continue;
    const pulse = 0.6 + 0.4 * Math.sin(t * 3.4);
    ctx.save();
    ctx.globalAlpha = 0.28 + 0.14 * pulse;
    ctx.fillStyle = m.col;
    ctx.beginPath();
    ctx.arc(m.x, m.y, m.r * (0.9 + 0.12 * pulse), 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 0.9;
    ctx.strokeStyle = m.col;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(m.x, m.y, m.r, 0, TAU);
    ctx.stroke();
    // beacon
    ctx.globalAlpha = 0.5 + 0.3 * pulse;
    ctx.fillStyle = m.col;
    ctx.beginPath();
    ctx.ellipse(m.x, m.y - 26, m.r * 0.16, m.r * 0.5, 0, 0, TAU);
    ctx.fill();
    ctx.restore();
  }
}

// ------------------------------------------------------------------ props

function drawPropsLow(g, ctx) {
  for (const p of g.world.props) {
    if (p.kind !== 'palm' && p.kind !== 'bench') continue;
    if (!vis(p.x - 30, p.y - 30, 60, 60)) continue;
    if (p.kind === 'palm') {
      const sway = Math.sin(g.time * 1.1 + p.sway) * 2 * p.s;
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath();
      ctx.ellipse(p.x + 6, p.y + 6, 12, 8, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#4a3a26';
      ctx.beginPath();
      ctx.arc(p.x, p.y, 4.5, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = '#1d5c33';
      ctx.lineWidth = 3.4;
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * TAU + sway * 0.05;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.quadraticCurveTo(p.x + Math.cos(a) * 10, p.y + Math.sin(a) * 10, p.x + Math.cos(a) * 17 + sway, p.y + Math.sin(a) * 17);
        ctx.stroke();
      }
    } else {
      ctx.fillStyle = '#3a3226';
      ctx.fillRect(p.x - 12, p.y - 4, 24, 8);
    }
  }
}

function drawPropsHigh(g, ctx) {
  // cranes
  for (const cr of g.world.cranes) {
    if (!vis(cr.x - 120, cr.y - 220, 240, 260)) continue;
    ctx.strokeStyle = '#c8a23c';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(cr.x, cr.y);
    ctx.lineTo(cr.x, cr.y - 150);
    ctx.moveTo(cr.x, cr.y - 150);
    ctx.lineTo(cr.x + cr.dir * 190, cr.y - 150);
    ctx.stroke();
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(cr.x, cr.y - 150);
    ctx.lineTo(cr.x + cr.dir * 120, cr.y - 60);
    ctx.stroke();
    ctx.fillStyle = '#ffd24a';
    ctx.fillRect(cr.x + cr.dir * 118, cr.y - 58, 6, 14);
    ctx.fillStyle = '#2b2b30';
    ctx.fillRect(cr.x - 16, cr.y - 20, 32, 26);
  }
  // tower mast
  const T = g.world.tower;
  if (vis(T.x - 30, T.y - 90, 100, 160)) {
    ctx.strokeStyle = '#9aa2b2';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(T.x + T.w / 2, T.y);
    ctx.lineTo(T.x + T.w / 2, T.y - 70);
    ctx.stroke();
    const blink = Math.sin(g.time * 4) > 0;
    if (blink) {
      ctx.fillStyle = '#ff3b3b';
      ctx.beginPath();
      ctx.arc(T.x + T.w / 2, T.y - 74, 4, 0, TAU);
      ctx.fill();
    }
    // tower cab
    ctx.fillStyle = '#2c3346';
    ctx.fillRect(T.x + T.w / 2 - 22, T.y - 40, 44, 22);
    ctx.fillStyle = 'rgba(255,224,150,0.85)';
    ctx.fillRect(T.x + T.w / 2 - 16, T.y - 36, 32, 12);
  }
  // windsock
  for (const pr of g.world.props) {
    if (pr.kind !== 'windsock') continue;
    if (!vis(pr.x - 30, pr.y - 30, 60, 60)) continue;
    ctx.fillStyle = '#c8c8d0';
    ctx.fillRect(pr.x - 2, pr.y - 24, 4, 24);
    ctx.fillStyle = '#ff7a1a';
    const flap = Math.sin(g.time * 3) * 3;
    ctx.beginPath();
    ctx.moveTo(pr.x + 2, pr.y - 24);
    ctx.lineTo(pr.x + 22 + flap, pr.y - 20);
    ctx.lineTo(pr.x + 22 + flap, pr.y - 14);
    ctx.lineTo(pr.x + 2, pr.y - 16);
    ctx.closePath();
    ctx.fill();
  }
}

// ------------------------------------------------------------------ buildings

function drawBuildings(g, ctx) {
  const camx = g.cam.x, camy = g.cam.y;
  for (const b of g.world.buildings) {
    if (!vis(b.x - 60, b.y - 60, b.w + 120, b.h + 120)) continue;
    const k = b.z * 0.0016;
    const ox = (b.x + b.w / 2 - camx) * k;
    const oy = (b.y + b.h / 2 - camy) * k;

    // ground shadow
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(b.x + 5, b.y + 5, b.w, b.h);

    // walls (side faces toward camera)
    const rx = b.x + ox, ry = b.y + oy;
    ctx.fillStyle = b.base;
    ctx.beginPath();
    ctx.moveTo(b.x, b.y);
    ctx.lineTo(rx, ry);
    ctx.lineTo(rx + b.w, ry);
    ctx.lineTo(b.x + b.w, b.y);
    ctx.lineTo(b.x + b.w, b.y + b.h);
    ctx.lineTo(rx + b.w, ry + b.h);
    ctx.lineTo(rx, ry + b.h);
    ctx.lineTo(b.x, b.y + b.h);
    ctx.closePath();
    ctx.fill();
    // wall shading on the leading faces
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    if (ox > 0) ctx.fillRect(b.x, b.y, ox > b.w ? b.w : ox, b.h);
    if (oy > 0) ctx.fillRect(b.x, b.y, b.w, oy > b.h ? b.h : oy);

    // roof
    ctx.fillStyle = b.roof;
    ctx.fillRect(rx, ry, b.w, b.h);
    ctx.strokeStyle = 'rgba(0,0,0,0.45)';
    ctx.lineWidth = 2;
    ctx.strokeRect(rx, ry, b.w, b.h);

    // rooftop AC boxes
    if (b.ac) {
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.fillRect(rx + b.w * 0.2, ry + b.h * 0.25, 16, 12);
      ctx.fillRect(rx + b.w * 0.6, ry + b.h * 0.6, 20, 14);
      ctx.fillStyle = 'rgba(255,255,255,0.06)';
      ctx.fillRect(rx + b.w * 0.2, ry + b.h * 0.25, 16, 4);
    }

    // neon trim
    if (b.neon) {
      ctx.save();
      ctx.strokeStyle = b.neon;
      ctx.lineWidth = 3;
      ctx.shadowColor = b.neon;
      ctx.shadowBlur = 14;
      ctx.strokeRect(rx + 4, ry + 4, b.w - 8, b.h - 8);
      ctx.restore();
    }
    if (b.trim && b.trim !== b.neon) {
      ctx.save();
      ctx.strokeStyle = b.trim;
      ctx.lineWidth = 2;
      ctx.shadowColor = b.trim;
      ctx.shadowBlur = 9;
      ctx.beginPath();
      ctx.moveTo(rx + b.w * 0.3, ry + b.h - 6);
      ctx.lineTo(rx + b.w * 0.7, ry + b.h - 6);
      ctx.stroke();
      ctx.restore();
    }
    // landmark signs
    if (b.tag) {
      ctx.save();
      ctx.fillStyle = b.neon || '#ffd24a';
      ctx.shadowColor = b.neon || '#ffd24a';
      ctx.shadowBlur = 12;
      ctx.font = 'bold 16px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(signFor(b), rx + b.w / 2, ry + b.h / 2 + 5);
      ctx.restore();
    }
  }
}

function signFor(b) {
  // landmark buildings carry a tag; identify by footprint
  const x = b.x, y = b.y;
  if (x === 1300 && y === 700) return 'H';
  if (x === 2500 && y === 2500) return 'POLICE';
  if (x === 2500 && y === 1300) return 'RICO';
  if (x === 3100 && y === 1900) return 'GARAGE';
  if (x === 700 && y === 2500) return 'HOME';
  if (x === 3470 && y === 640) return 'FERRETTI';
  return '';
}

// ------------------------------------------------------------------ entities

function drawHeadlights(g, ctx) {
  for (const c of g.cars) {
    if (c.dead || !vis(c.x - 160, c.y - 160, 320, 320)) continue;
    if (c.driver === null && c.kind === 'parked') continue;
    const cos = Math.cos(c.ang), sin = Math.sin(c.ang);
    const fx = c.x + cos * c.l * 0.45, fy = c.y + sin * c.l * 0.45;
    for (const s of [-1, 1]) {
      const px = fx - sin * s * c.w * 0.32;
      const py = fy + cos * s * c.w * 0.32;
      const ex = px + cos * 150, ey = py + sin * 150;
      const grad = ctx.createLinearGradient(px, py, ex, ey);
      grad.addColorStop(0, 'rgba(255,240,190,0.16)');
      grad.addColorStop(1, 'rgba(255,240,190,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(px + cos * 150 - sin * 34, py + sin * 150 + cos * 34);
      ctx.lineTo(px + cos * 150 + sin * 34, py + sin * 150 - cos * 34);
      ctx.closePath();
      ctx.fill();
    }
    // red taillights
    const bx = c.x - cos * c.l * 0.45, by = c.y - sin * c.l * 0.45;
    ctx.fillStyle = c.brake > 0 ? '#ff4040' : 'rgba(255,64,64,0.55)';
    ctx.fillRect(bx - sin * -c.w * 0.3 - 2, by + cos * -c.w * 0.3 - 2, 5, 5);
    ctx.fillRect(bx - sin * c.w * 0.3 - 2, by + cos * c.w * 0.3 - 2, 5, 5);
  }
}

function drawPeds(g, ctx) {
  for (const p of g.peds) {
    if (!vis(p.x - 20, p.y - 20, 40, 40)) continue;
    // shadow
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(p.x + 3, p.y + 4, 9, 6, 0, 0, TAU);
    ctx.fill();
    if (p.dead) {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.ang);
      ctx.globalAlpha = clamp(1 - (p.deadT - 14) / 8, 0.25, 1);
      ctx.fillStyle = p.shirt;
      ctx.fillRect(-8, -4, 16, 8);
      ctx.fillStyle = p.skin;
      ctx.beginPath();
      ctx.arc(10, 0, 3.6, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.restore();
      continue;
    }
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.ang);
    const bob = Math.sin(p.walkPhase || 0) * 1.6;
    // legs
    ctx.fillStyle = p.pants;
    ctx.fillRect(-5, -6 + bob, 7, 4);
    ctx.fillRect(-5, 2 - bob, 7, 4);
    // torso
    ctx.fillStyle = p.shirt;
    ctx.beginPath();
    ctx.ellipse(0, 0, 6.5, 5, 0, 0, TAU);
    ctx.fill();
    // cop details
    if (p.kind === 'cop') {
      ctx.fillStyle = '#e8e8f0';
      ctx.fillRect(-2, -4.5, 3, 9);
    }
    // head
    ctx.fillStyle = p.skin;
    ctx.beginPath();
    ctx.arc(2.5, 0, 3.4, 0, TAU);
    ctx.fill();
    if (p.kind === 'cop') {
      ctx.fillStyle = '#151d38';
      ctx.fillRect(0.5, -3.4, 3.4, 6.8);
    }
    // gun for armed
    if (p.kind === 'cop' || (p.gunT && p.gunT > 0)) {
      ctx.fillStyle = '#20242c';
      ctx.fillRect(4, 1.5, 7, 2);
    }
    ctx.restore();
  }
}

function drawCars(g, ctx) {
  for (const c of g.cars) {
    if (!vis(c.x - 90, c.y - 90, 180, 180)) continue;
    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.rotate(c.ang);
    // shadow
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    rrect(ctx, -c.l / 2 + 4, -c.w / 2 + 4, c.l, c.w, 6);
    ctx.fill();

    const hurt = c.hp / c.maxHp;
    let body = c.color;
    if (c.dead) body = '#232327';
    else if (hurt < 0.5) body = shadeMix(c.color, 0.55);

    // body
    ctx.fillStyle = body;
    rrect(ctx, -c.l / 2, -c.w / 2, c.l, c.w, 6);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.lineWidth = 2;
    rrect(ctx, -c.l / 2, -c.w / 2, c.l, c.w, 6);
    ctx.stroke();

    if (!c.dead) {
      // cabin / windshield
      ctx.fillStyle = 'rgba(12,18,30,0.85)';
      rrect(ctx, -c.l * 0.12, -c.w / 2 + 4, c.l * 0.36, c.w - 8, 4);
      ctx.fill();
      // hood line
      ctx.strokeStyle = 'rgba(255,255,255,0.14)';
      ctx.beginPath();
      ctx.moveTo(c.l * 0.28, -c.w / 2 + 3);
      ctx.lineTo(c.l * 0.28, c.w / 2 - 3);
      ctx.stroke();
      // taxi sign / police details
      if (c.type.id === 'taxi') {
        ctx.fillStyle = '#20242c';
        ctx.fillRect(-4, -c.w / 2 - 3, 10, 4);
      }
      if (c.kind === 'police') {
        ctx.fillStyle = CFG.POLICE_STRIPE;
        ctx.fillRect(-c.l * 0.32, -c.w / 2, 5, c.w);
        if (c.siren || c.lightbar) {
          const ph = Math.floor(g.time * 6) % 2;
          ctx.fillStyle = ph ? '#ff3040' : 'rgba(255,48,64,0.25)';
          ctx.fillRect(-6, -c.w / 2 - 3, 5, 4);
          ctx.fillStyle = ph ? 'rgba(64,120,255,0.25)' : '#4078ff';
          ctx.fillRect(1, -c.w / 2 - 3, 5, 4);
          if (ph) {
            ctx.fillStyle = 'rgba(255,48,64,0.13)';
            ctx.beginPath();
            ctx.arc(0, 0, 26, 0, TAU);
            ctx.fill();
          } else {
            ctx.fillStyle = 'rgba(64,120,255,0.13)';
            ctx.beginPath();
            ctx.arc(0, 0, 26, 0, TAU);
            ctx.fill();
          }
        }
      }
      // fire flicker
      if (c.burning > 0) {
        ctx.fillStyle = `rgba(255,120,30,${0.25 + 0.2 * Math.random()})`;
        rrect(ctx, -c.l / 2, -c.w / 2, c.l, c.w, 6);
        ctx.fill();
      }
      // char marks when hurt
      if (hurt < 0.6) {
        ctx.fillStyle = 'rgba(10,10,10,0.35)';
        ctx.fillRect(-c.l * 0.4, -c.w * 0.3, 8, 6);
        ctx.fillRect(c.l * 0.2, c.w * 0.1, 9, 5);
      }
    } else {
      // burnt hull details
      ctx.strokeStyle = 'rgba(0,0,0,0.6)';
      ctx.beginPath();
      ctx.moveTo(-c.l * 0.3, -c.w * 0.2);
      ctx.lineTo(c.l * 0.3, c.w * 0.2);
      ctx.stroke();
    }
    ctx.restore();
  }
}

function drawPlayer(g, ctx) {
  const p = g.player;
  if (!p || p.car || p.dead) return;
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.beginPath();
  ctx.ellipse(p.x + 3, p.y + 4, 10, 7, 0, 0, TAU);
  ctx.fill();
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(p.ang);
  const bob = Math.sin(p.walkPhase) * 1.8;
  ctx.fillStyle = '#2a2a3a';
  ctx.fillRect(-6, -6 + bob, 8, 4);
  ctx.fillRect(-6, 2 - bob, 8, 4);
  ctx.fillStyle = '#e0e0e8';
  ctx.beginPath();
  ctx.ellipse(0, 0, 7, 5.5, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#c8a284';
  ctx.beginPath();
  ctx.arc(2.5, 0, 3.6, 0, TAU);
  ctx.fill();
  // pistol
  ctx.fillStyle = '#20242c';
  ctx.fillRect(4.5, 1, 8, 2.4);
  ctx.restore();
  // hurt flash
  if (p.hurtT > 0) {
    ctx.fillStyle = `rgba(255,40,40,${p.hurtT * 0.6})`;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 14, 0, TAU);
    ctx.fill();
  }
}

function drawBullets(g, ctx) {
  ctx.strokeStyle = 'rgba(255,230,150,0.9)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (const b of g.bullets) {
    ctx.moveTo(b.x, b.y);
    ctx.lineTo(b.x - b.vx * 0.012, b.y - b.vy * 0.012);
  }
  ctx.stroke();
}

function drawParticles(g, ctx) {
  for (const p of g.parts) {
    const a = clamp(p.life / p.maxLife, 0, 1);
    if (p.kind === 'smoke') {
      ctx.fillStyle = `rgba(90,90,96,${a * 0.5})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, (1 - a) * 16 + 4, 0, TAU);
      ctx.fill();
    } else if (p.kind === 'fire') {
      ctx.fillStyle = `rgba(255,${100 + Math.floor(100 * a)},30,${a * 0.8})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3 + (1 - a) * 5, 0, TAU);
      ctx.fill();
    } else if (p.kind === 'spark') {
      ctx.fillStyle = `rgba(255,220,120,${a})`;
      ctx.fillRect(p.x - 1.5, p.y - 1.5, 3, 3);
    } else if (p.kind === 'muzzle') {
      ctx.fillStyle = `rgba(255,240,180,${a})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 5, 0, TAU);
      ctx.fill();
    } else if (p.kind === 'blood') {
      ctx.fillStyle = `rgba(150,20,26,${a * 0.8})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3, 0, TAU);
      ctx.fill();
    }
  }
}

function drawExplosions(g, ctx) {
  for (const e of g.explosions) {
    const t = e.t; // seconds since boom
    if (t > 1.2) continue;
    const r = 20 + t * 190;
    const a = clamp(1 - t / 1.2, 0, 1);
    const grad = ctx.createRadialGradient(e.x, e.y, r * 0.15, e.x, e.y, r);
    grad.addColorStop(0, `rgba(255,250,220,${a * 0.95})`);
    grad.addColorStop(0.35, `rgba(255,160,40,${a * 0.8})`);
    grad.addColorStop(0.7, `rgba(200,60,20,${a * 0.5})`);
    grad.addColorStop(1, 'rgba(60,30,20,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(e.x, e.y, r, 0, TAU);
    ctx.fill();
  }
}

// ------------------------------------------------------------------ post

function drawWetSheen(g, ctx) {
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  const t = g.time;
  ctx.strokeStyle = 'rgba(140,170,230,0.05)';
  ctx.lineWidth = 10;
  ctx.beginPath();
  for (const vx of ROAD_V) {
    if (vx < view.x0 - 200 || vx > view.x1 + 200) continue;
    for (let y = Math.floor(view.y0 / 90) * 90; y < view.y1; y += 90) {
      const o = Math.sin(t * 0.7 + y * 0.01) * 6;
      ctx.moveTo(vx - 30 + o, y);
      ctx.lineTo(vx + 30 + o, y + 34);
    }
  }
  for (const hy of ROAD_H) {
    if (hy < view.y0 - 200 || hy > view.y1 + 200) continue;
    for (let x = Math.floor(view.x0 / 90) * 90; x < view.x1; x += 90) {
      const o = Math.sin(t * 0.7 + x * 0.01) * 6;
      ctx.moveTo(x, hy - 30 + o);
      ctx.lineTo(x + 34, hy + 30 + o);
    }
  }
  ctx.stroke();
  ctx.restore();
}

function drawNightGrade(g, ctx) {
  const grad = ctx.createRadialGradient(CFG.VIEW_W / 2, CFG.VIEW_H / 2, 240, CFG.VIEW_W / 2, CFG.VIEW_H / 2, 780);
  grad.addColorStop(0, 'rgba(8,10,30,0)');
  grad.addColorStop(1, 'rgba(4,6,20,0.55)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, CFG.VIEW_W, CFG.VIEW_H);
  ctx.fillStyle = 'rgba(14,18,52,0.14)';
  ctx.fillRect(0, 0, CFG.VIEW_W, CFG.VIEW_H);
}

// ------------------------------------------------------------------ utils

function rrect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function shadeMix(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.round(((n >> 16) & 255) * f);
  const gg = Math.round(((n >> 8) & 255) * f);
  const b = Math.round((n & 255) * f);
  return '#' + ((1 << 24) | (r << 16) | (gg << 8) | b).toString(16).slice(1);
}
