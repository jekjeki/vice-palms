// Vice Palms — night render pipeline: neon glow, headlights, explosion flash, world
import { S } from './game.js';
import { CITY_W, CITY_H, OCEAN_Y, ROAD, ROAD_HALF, PITCH } from './world.js';

const VW = 1280, VH = 720;

let view = { x0: 0, y0: 0, x1: 0, y1: 0 };

function inView(x, y, pad) {
  return x > view.x0 - pad && x < view.x1 + pad && y > view.y0 - pad && y < view.y1 + pad;
}

export function drawWorld(s, ctx) {
  const camX = s.cam.x + (s.shake ? (Math.random() - 0.5) * s.shake : 0);
  const camY = s.cam.y + (s.shake ? (Math.random() - 0.5) * s.shake : 0);
  view.x0 = camX - VW / 2; view.y0 = camY - VH / 2;
  view.x1 = camX + VW / 2; view.y1 = camY + VH / 2;

  ctx.save();
  if (!s.world) { drawTitleBackdrop(ctx, s); ctx.restore(); return; }

  ctx.translate(VW / 2 - camX, VH / 2 - camY);
  ctx.fillStyle = '#14161c';
  ctx.fillRect(view.x0, view.y0, VW, VH);

  drawGround(ctx);
  drawDecals(ctx, s);
  drawMarkers(ctx, s);
  drawPickups(ctx, s);
  drawBlocks(ctx, s);
  drawTrees(ctx, s);
  drawPeds(ctx, s);
  drawCars(ctx, s);
  drawPlayer(ctx, s);
  drawGlow(ctx, s);
  drawBullets(ctx, s);
  drawParticles(ctx, s);

  ctx.restore();

  // explosion flash + heat vignette (screen space)
  if (s.flash > 0.01) {
    ctx.fillStyle = `rgba(255,244,220,${Math.min(0.75, s.flash * 0.6)})`;
    ctx.fillRect(0, 0, VW, VH);
  }
  if (s.wanted > 0) {
    const a = 0.10 + 0.05 * Math.sin(s.time * 6);
    const g = ctx.createRadialGradient(VW / 2, VH / 2, VH * 0.42, VW / 2, VH / 2, VH * 0.85);
    g.addColorStop(0, 'rgba(120,0,20,0)');
    g.addColorStop(1, `rgba(150,0,20,${a})`);
    ctx.fillStyle = g; ctx.fillRect(0, 0, VW, VH);
  }
}

// ---- ground: roads, sidewalks base, beach -----------------------------------
function drawGround(ctx) {
  const w = S.world;
  // sidewalk-colored block bases are drawn per-block; roads first
  ctx.fillStyle = '#23262e';
  for (const v of w.roadsV) {
    if (v + ROAD_HALF < view.x0 || v - ROAD_HALF > view.x1) continue;
    ctx.fillRect(v - ROAD_HALF, Math.max(0, view.y0), ROAD, Math.min(CITY_H, view.y1) - Math.max(0, view.y0));
  }
  for (const h of w.roadsH) {
    if (h + ROAD_HALF < view.y0 || h - ROAD_HALF > view.y1) continue;
    ctx.fillRect(Math.max(0, view.x0), h - ROAD_HALF, Math.min(CITY_W, view.x1) - Math.max(0, view.x0), ROAD);
  }
  // center dashes
  ctx.strokeStyle = '#4a4f5e'; ctx.lineWidth = 3; ctx.setLineDash([26, 30]);
  ctx.beginPath();
  for (const v of w.roadsV) {
    if (v < view.x0 || v > view.x1) continue;
    ctx.moveTo(v, Math.max(0, view.y0)); ctx.lineTo(v, Math.min(CITY_H, view.y1));
  }
  for (const h of w.roadsH) {
    if (h < view.y0 || h > view.y1) continue;
    ctx.moveTo(Math.max(0, view.x0), h); ctx.lineTo(Math.min(CITY_W, view.x1), h);
  }
  ctx.stroke(); ctx.setLineDash([]);
  // beach + ocean
  if (view.y1 > CITY_H) {
    ctx.fillStyle = '#c9b26e';
    ctx.fillRect(view.x0, CITY_H, VW, Math.min(view.y1, OCEAN_Y) - CITY_H);
    if (view.y1 > OCEAN_Y) {
      ctx.fillStyle = '#0d2c4a';
      ctx.fillRect(view.x0, OCEAN_Y, VW, view.y1 - OCEAN_Y);
      ctx.strokeStyle = 'rgba(120,190,255,0.25)'; ctx.lineWidth = 2;
      const t = Math.floor(S.time * 2);
      ctx.beginPath();
      for (let x = Math.floor(view.x0 / 90) * 90; x < view.x1; x += 90) {
        const yy = OCEAN_Y + 26 + ((x / 90 + t) % 4) * 26;
        ctx.moveTo(x, yy); ctx.lineTo(x + 44, yy);
      }
      ctx.stroke();
      ctx.fillStyle = '#c9b26e';
      ctx.fillRect(0, OCEAN_Y - 6, CITY_W, 6);
    }
  }
}

function drawDecals(ctx, s) {
  for (const d of s.decals) {
    if (!inView(d.x, d.y, d.r)) continue;
    ctx.fillStyle = d.c;
    ctx.beginPath(); ctx.arc(d.x, d.y, d.r, 0, 7); ctx.fill();
  }
}

function drawMarkers(ctx, s) {
  const m = s.missions && s.missions.marker();
  if (!m) return;
  const pulse = 0.6 + 0.4 * Math.sin(s.time * 5);
  ctx.save();
  ctx.globalAlpha = 0.28 + 0.2 * pulse;
  ctx.fillStyle = '#ffd23e';
  ctx.beginPath(); ctx.arc(m.x, m.y, m.r, 0, 7); ctx.fill();
  ctx.globalAlpha = 0.9;
  ctx.strokeStyle = '#ffd23e'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(m.x, m.y, m.r * (0.8 + 0.2 * pulse), 0, 7); ctx.stroke();
  // floating arrow
  const ay = m.y - 46 - 8 * Math.sin(s.time * 4);
  ctx.fillStyle = '#ffd23e';
  ctx.beginPath();
  ctx.moveTo(m.x, ay + 16); ctx.lineTo(m.x - 10, ay); ctx.lineTo(m.x + 10, ay);
  ctx.closePath(); ctx.fill();
  ctx.restore();
}

function drawPickups(ctx, s) {
  for (const u of s.world.pickups) {
    if (u.taken || !inView(u.x, u.y, 40)) continue;
    const bob = Math.sin(s.time * 3 + u.x) * 3;
    const col = u.kind === 'health' ? '#ff4b6b' : u.kind === 'armor' ? '#4b9dff' : '#ffd23e';
    ctx.save(); ctx.translate(u.x, u.y + bob);
    ctx.shadowColor = col; ctx.shadowBlur = 14;
    ctx.fillStyle = col;
    ctx.fillRect(-9, -9, 18, 18);
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#0b0c10';
    if (u.kind === 'health') { ctx.fillRect(-5, -2, 10, 4); ctx.fillRect(-2, -5, 4, 10); }
    else if (u.kind === 'armor') { ctx.fillRect(-4, -4, 8, 8); }
    else { ctx.fillRect(-5, -4, 3, 8); ctx.fillRect(-1, -4, 3, 8); ctx.fillRect(3, -4, 2, 8); }
    ctx.restore();
  }
}

// ---- blocks / buildings / neon -----------------------------------------------
function drawBlocks(ctx, s) {
  const w = s.world;
  let neonCount = 0;
  for (const b of w.blocks) {
    if (!inView(b.x + b.w / 2, b.y + b.h / 2, Math.max(b.w, b.h))) continue;
    if (b.kind === 'park') {
      ctx.fillStyle = '#17341f'; ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.fillStyle = '#1d4028'; ctx.fillRect(b.x + 18, b.y + 18, b.w - 36, 8);
      if (w.pond && inView(w.pond.x, w.pond.y, 160)) {
        ctx.fillStyle = '#1c4d66';
        ctx.beginPath(); ctx.ellipse(w.pond.x, w.pond.y, w.pond.rx, w.pond.ry, 0, 0, 7); ctx.fill();
      }
    } else {
      ctx.fillStyle = '#20242e'; ctx.fillRect(b.x, b.y, b.w, b.h); // sidewalk
    }
    for (const bd of b.buildings) {
      if (!inView(bd.x + bd.w / 2, bd.y + bd.h / 2, Math.max(bd.w, bd.h))) continue;
      if (bd.cont) {
        ctx.fillStyle = bd.c; ctx.globalAlpha = 0.8;
        ctx.fillRect(bd.x, bd.y, bd.w, bd.h);
        ctx.globalAlpha = 1;
        ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(bd.x, bd.y + bd.h - 8, bd.w, 8);
        ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.strokeRect(bd.x + 0.5, bd.y + 0.5, bd.w - 1, bd.h - 1);
        continue;
      }
      ctx.fillStyle = bd.c;
      ctx.fillRect(bd.x, bd.y, bd.w, bd.h);
      // rooftop shade
      ctx.fillStyle = 'rgba(255,255,255,0.03)';
      ctx.fillRect(bd.x, bd.y, bd.w, 6);
      // lit windows (deterministic hash)
      if (bd.win && !bd.crane) {
        ctx.fillStyle = bd.win;
        const step = 22;
        for (let wx = bd.x + 10; wx < bd.x + bd.w - 12; wx += step) {
          for (let wy = bd.y + 12; wy < bd.y + bd.h - 12; wy += step) {
            const h = ((wx * 73856093) ^ (wy * 19349663)) >>> 0;
            if ((h % 100) / 100 < bd.lit) {
              ctx.globalAlpha = 0.5 + (h % 40) / 100;
              ctx.fillRect(wx, wy, 8, 5);
            }
          }
        }
        ctx.globalAlpha = 1;
      }
      if (bd.crane) {
        ctx.strokeStyle = '#665a2c'; ctx.lineWidth = 3;
        ctx.strokeRect(bd.x, bd.y, bd.w, bd.h);
      }
      // neon trim
      if (bd.neon && neonCount < 34) {
        neonCount++;
        ctx.save();
        ctx.shadowColor = bd.nc; ctx.shadowBlur = 14;
        ctx.strokeStyle = bd.nc; ctx.lineWidth = 2.5;
        ctx.strokeRect(bd.x + 2, bd.y + 2, bd.w - 4, bd.h - 4);
        ctx.restore();
      }
    }
  }
  // neon signs
  for (const g of w.signs) {
    if (!inView(g.x, g.y, 120)) continue;
    ctx.save();
    ctx.font = 'bold 15px Arial';
    ctx.textAlign = 'center';
    ctx.shadowColor = g.c; ctx.shadowBlur = 16;
    ctx.fillStyle = g.c;
    const tw = ctx.measureText(g.txt).width;
    if (tw < g.w) ctx.fillText(g.txt, g.x, g.y);
    ctx.restore();
  }
}

function drawTrees(ctx, s) {
  for (const t of s.world.trees) {
    if (!inView(t.x, t.y, 40)) continue;
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath(); ctx.arc(t.x + 4, t.y + 5, t.r * 0.9, 0, 7); ctx.fill();
    if (t.palm) {
      ctx.fillStyle = '#2e5a33';
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2 + t.x;
        ctx.beginPath(); ctx.ellipse(t.x + Math.cos(a) * t.r * 0.7, t.y + Math.sin(a) * t.r * 0.7, t.r * 0.62, t.r * 0.3, a, 0, 7); ctx.fill();
      }
      ctx.fillStyle = '#7a5a30';
      ctx.beginPath(); ctx.arc(t.x, t.y, 4, 0, 7); ctx.fill();
    } else {
      ctx.fillStyle = '#2e5a33';
      ctx.beginPath(); ctx.arc(t.x, t.y, t.r, 0, 7); ctx.fill();
      ctx.fillStyle = '#3a6e40';
      ctx.beginPath(); ctx.arc(t.x - t.r * 0.25, t.y - t.r * 0.25, t.r * 0.55, 0, 7); ctx.fill();
    }
  }
}

// ---- actors -------------------------------------------------------------------
function drawPeds(ctx, s) {
  for (const q of s.peds.list) {
    if (!inView(q.x, q.y, 30)) continue;
    if (q.dead) {
      ctx.fillStyle = 'rgba(90,14,20,0.7)';
      ctx.beginPath(); ctx.ellipse(q.x, q.y, 12, 8, q.a, 0, 7); ctx.fill();
      continue;
    }
    const bob = Math.sin(q.walkT || 0) * 2;
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.beginPath(); ctx.ellipse(q.x + 2, q.y + 3, 9, 6, 0, 0, 7); ctx.fill();
    ctx.fillStyle = q.gang ? '#3ad46a' : q.shirt;
    ctx.beginPath(); ctx.arc(q.x, q.y + bob * 0.3, 7, 0, 7); ctx.fill();
    ctx.fillStyle = q.skin;
    ctx.beginPath(); ctx.arc(q.x + Math.cos(q.a) * 3, q.y + Math.sin(q.a) * 3, 4, 0, 7); ctx.fill();
  }
}

function drawCars(ctx, s) {
  const all = [...s.traffic.cars, ...s.police.cops];
  for (const c of all) {
    if (!inView(c.x, c.y, 160)) continue;
    drawCar(ctx, c, s);
  }
  if (s.player.inCar && !inView(s.player.inCar.x, s.player.inCar.y, 160)) drawCar(ctx, s.player.inCar, s);
}

function drawCar(ctx, c, s) {
  ctx.save();
  ctx.translate(c.x, c.y); ctx.rotate(c.a);
  if (c.dead) {
    ctx.fillStyle = '#1c1a18';
    ctx.fillRect(-c.w / 2, -c.h / 2, c.w, c.h);
    ctx.fillStyle = '#0d0c0b';
    ctx.fillRect(-c.w / 2 + 6, -c.h / 2 + 4, c.w - 12, c.h - 8);
    ctx.restore(); return;
  }
  // headlight cones (additive, drawn under body)
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const g = ctx.createLinearGradient(0, 0, 150, 0);
  g.addColorStop(0, 'rgba(255,240,190,0.22)');
  g.addColorStop(1, 'rgba(255,240,190,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(c.w / 2 - 2, -c.h / 2 + 2);
  ctx.lineTo(c.w / 2 + 150, -c.h / 2 - 34);
  ctx.lineTo(c.w / 2 + 150, c.h / 2 + 34);
  ctx.lineTo(c.w / 2 - 2, c.h / 2 - 2);
  ctx.closePath(); ctx.fill();
  ctx.restore();

  // body
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.fillRect(-c.w / 2 + 3, -c.h / 2 + 4, c.w, c.h);
  ctx.fillStyle = c.color;
  ctx.fillRect(-c.w / 2, -c.h / 2, c.w, c.h);
  // cabin
  ctx.fillStyle = 'rgba(20,26,34,0.9)';
  ctx.fillRect(-c.w * 0.16, -c.h / 2 + 3, c.w * 0.42, c.h - 6);
  // hood stripe for sport
  if (c.type === 'sport') { ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(c.w * 0.3, -c.h / 2 + 4, 6, c.h - 8); }
  // taillights
  ctx.fillStyle = 'rgba(255,60,40,0.9)';
  ctx.fillRect(-c.w / 2, -c.h / 2 + 3, 3, 5);
  ctx.fillRect(-c.w / 2, c.h / 2 - 8, 3, 5);
  // headlights
  ctx.fillStyle = 'rgba(255,244,200,0.95)';
  ctx.fillRect(c.w / 2 - 3, -c.h / 2 + 3, 3, 5);
  ctx.fillRect(c.w / 2 - 3, c.h / 2 - 8, 3, 5);
  // cop lightbar
  if (c.isCop) {
    const f = Math.floor(s.time * 6) % 2;
    ctx.fillStyle = f ? '#ff3b3b' : '#3b6bff';
    ctx.fillRect(-4, -c.h / 2 + 2, 8, 5);
    ctx.shadowColor = f ? '#ff3b3b' : '#3b6bff'; ctx.shadowBlur = 12;
    ctx.fillRect(-4, -c.h / 2 + 2, 8, 5);
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#16202e';
    ctx.fillRect(-c.w * 0.42, -c.h / 2, c.w * 0.28, c.h);
  }
  ctx.restore();
}

function drawPlayer(ctx, s) {
  const p = s.player;
  if (p.inCar) return;
  const bob = Math.sin(p.walkT) * 2.4;
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.beginPath(); ctx.ellipse(p.x + 2, p.y + 4, 10, 6, 0, 0, 7); ctx.fill();
  // body
  ctx.fillStyle = '#e8e4da';
  ctx.beginPath(); ctx.arc(p.x, p.y + bob * 0.3, 8.5, 0, 7); ctx.fill();
  ctx.fillStyle = '#c9552e';
  ctx.beginPath(); ctx.arc(p.x, p.y + bob * 0.3, 8.5, p.a + 2.2, p.a - 2.2); ctx.fill();
  // head
  ctx.fillStyle = '#e8b48a';
  ctx.beginPath(); ctx.arc(p.x + Math.cos(p.a) * 3.5, p.y + Math.sin(p.a) * 3.5, 4.6, 0, 7); ctx.fill();
  // weapon
  ctx.strokeStyle = p.weapon === 'pistol' ? '#222' : '#e8b48a';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(p.x + Math.cos(p.a) * 6, p.y + Math.sin(p.a) * 6);
  ctx.lineTo(p.x + Math.cos(p.a) * 15, p.y + Math.sin(p.a) * 15);
  ctx.stroke();
}

function drawBullets(ctx, s) {
  ctx.strokeStyle = '#ffe9a0'; ctx.lineWidth = 2;
  ctx.beginPath();
  for (const b of s.bullets) {
    if (!inView(b.x, b.y, 40)) continue;
    ctx.moveTo(b.x - b.vx * 0.012, b.y - b.vy * 0.012);
    ctx.lineTo(b.x, b.y);
  }
  ctx.stroke();
}

function drawParticles(ctx, s) {
  for (const q of s.particles) {
    if (!inView(q.x, q.y, 60)) continue;
    const a = Math.max(0, q.life / q.max);
    ctx.save();
    ctx.globalCompositeOperation = q.fire ? 'lighter' : 'source-over';
    ctx.globalAlpha = a * (q.fire ? 0.9 : 0.55);
    ctx.fillStyle = q.c;
    ctx.beginPath(); ctx.arc(q.x, q.y, q.r * (0.5 + a * 0.7), 0, 7); ctx.fill();
    ctx.restore();
  }
}

// glow pass: extra halos around neon signs (cheap, additive)
function drawGlow(ctx, s) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const g of s.world.signs) {
    if (!inView(g.x, g.y, 90)) continue;
    const r = ctx.createRadialGradient(g.x, g.y - 6, 4, g.x, g.y - 6, 52);
    r.addColorStop(0, g.c + '55');
    r.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = r;
    ctx.fillRect(g.x - 55, g.y - 60, 110, 110);
  }
  ctx.restore();
}

function drawTitleBackdrop(ctx, s) {
  const g = ctx.createLinearGradient(0, 0, 0, VH);
  g.addColorStop(0, '#120a22');
  g.addColorStop(0.6, '#2a0f38');
  g.addColorStop(1, '#0b1220');
  ctx.fillStyle = g; ctx.fillRect(0, 0, VW, VH);
  // horizon sun
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const sg = ctx.createRadialGradient(VW / 2, 430, 30, VW / 2, 430, 240);
  sg.addColorStop(0, 'rgba(255,90,140,0.5)');
  sg.addColorStop(1, 'rgba(255,90,140,0)');
  ctx.fillStyle = sg; ctx.fillRect(0, 190, VW, 480);
  ctx.restore();
  // palm silhouettes
  for (const [px, ph, sc] of [[120, 420, 1.2], [1150, 390, 1.05], [1010, 470, 0.8], [230, 480, 0.75]]) {
    ctx.strokeStyle = '#0a0714'; ctx.lineWidth = 12 * sc;
    ctx.beginPath();
    ctx.moveTo(px, VH); ctx.quadraticCurveTo(px + 24 * sc, VH - ph * 0.6, px + 10 * sc, VH - ph);
    ctx.stroke();
    for (let k = 0; k < 7; k++) {
      const a = (k / 7) * Math.PI * 2;
      ctx.lineWidth = 7 * sc;
      ctx.beginPath();
      ctx.moveTo(px + 10 * sc, VH - ph);
      ctx.quadraticCurveTo(
        px + 10 * sc + Math.cos(a) * 60 * sc, VH - ph + Math.sin(a) * 34 * sc - 14,
        px + 10 * sc + Math.cos(a) * 104 * sc, VH - ph + Math.sin(a) * 58 * sc + 12
      );
      ctx.stroke();
    }
  }
}
