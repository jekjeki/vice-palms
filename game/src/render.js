// render.js — night city base pass, neon & headlight glow, wet-road sheen, explosion flash,
// camera shake, and the circular minimap renderer.
import { CFG, COLORS } from './config.js';
import { clamp, TAU } from './util.js';
import { RAMP_SPOTS } from './jumps.js';

export function render(game, ctx) {
  const cam = game.cam;
  const W = CFG.VIEW_W, H = CFG.VIEW_H;
  ctx.save();
  ctx.fillStyle = COLORS.SKY_NIGHT;
  ctx.fillRect(0, 0, W, H);

  const shakeX = cam.shake > 0 ? (Math.random() * 2 - 1) * cam.shake : 0;
  const shakeY = cam.shake > 0 ? (Math.random() * 2 - 1) * cam.shake : 0;
  ctx.translate(W / 2 + shakeX, H / 2 + shakeY);
  ctx.scale(cam.zoom, cam.zoom);
  ctx.translate(-cam.x, -cam.y);

  const vx0 = cam.x - W / 2 / cam.zoom - 80, vx1 = cam.x + W / 2 / cam.zoom + 80;
  const vy0 = cam.y - H / 2 / cam.zoom - 80, vy1 = cam.y + H / 2 / cam.zoom + 80;
  const vis = { x0: vx0, y0: vy0, x1: vx1, y1: vy1 };
  game.vis = vis;

  drawGround(game, ctx, vis);
  drawRoads(game, ctx, vis);
  drawZoneProps(game, ctx, vis);
  drawBuildings(game, ctx, vis);
  drawMarkers(game, ctx);
  drawRamps(game, ctx);
  drawPickups(game, ctx);
  drawPeds(game, ctx);
  drawSkidmarks(game, ctx);
  drawCars(game, ctx);
  drawPlayer(game, ctx);
  drawBullets(game, ctx);
  drawParticles(game, ctx);
  drawHeli(game, ctx);
  drawHeadlights(game, ctx);
  drawNeonGlow(game, ctx, vis);
  drawWetSheen(game, ctx, vis);
  drawShopPrompt(game, ctx);

  ctx.restore();

  // screen-space overlays
  drawExplosionFlash(game, ctx);
  if (game.weather) game.weather.draw(ctx);
  drawNightVignette(ctx);
}

// ---------------------------------------------------------------- ground
function drawGround(game, ctx, vis) {
  const w = game.world;
  // base city fill
  ctx.fillStyle = COLORS.block;
  ctx.fillRect(vis.x0, vis.y0, vis.x1 - vis.x0, vis.y1 - vis.y0);

  // docks base
  ctx.fillStyle = COLORS.dock;
  ctx.fillRect(Math.max(vis.x0, 0), Math.max(vis.y0, -400), Math.min(vis.x1, 4300) - Math.max(vis.x0, 0), Math.min(vis.y1, CFG.DOCKS_S) - Math.max(vis.y0, -400));
  // sand
  ctx.fillStyle = COLORS.sand;
  ctx.fillRect(vis.x0, CFG.SAND_S, vis.x1 - vis.x0, CFG.OCEAN_S - CFG.SAND_S);
  // park
  const P = CFG.PARK;
  ctx.fillStyle = COLORS.park;
  ctx.fillRect(P.x0, P.y0, P.x1 - P.x0, P.y1 - P.y0);
  ctx.strokeStyle = '#2a3a28';
  ctx.lineWidth = 22;
  ctx.beginPath();
  ctx.moveTo(P.x0, (P.y0 + P.y1) / 2);
  ctx.lineTo(P.x1, (P.y0 + P.y1) / 2);
  ctx.moveTo((P.x0 + P.x1) / 2, P.y0);
  ctx.lineTo((P.x0 + P.x1) / 2, P.y1);
  ctx.stroke();

  // water (harbor north, ocean south) with animated stripes
  for (const wtr of w.water) {
    const y0 = Math.max(wtr.y0, vis.y0), y1 = Math.min(wtr.y1, vis.y1);
    if (y1 <= y0) continue;
    const x0 = Math.max(wtr.x0, vis.x0), x1 = Math.min(wtr.x1, vis.x1);
    ctx.fillStyle = COLORS.water;
    ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
    // wave stripes
    ctx.strokeStyle = COLORS.waterLit;
    ctx.lineWidth = 3;
    const t = game.t;
    for (let y = Math.floor(y0 / 46) * 46; y < y1; y += 46) {
      ctx.beginPath();
      const ph = Math.sin(t * 1.3 + y * 0.05) * 7;
      ctx.moveTo(x0 + 20, y + ph);
      ctx.lineTo(x1 - 20, y - ph);
      ctx.stroke();
    }
    // moon glint band down the middle of the south ocean
    if (wtr.kind === 'ocean' && y0 < CFG.OCEAN_S + 120) {
      const gx = (Math.sin(t * 0.11) * 0.5 + 0.5) * (CFG.W - 800) + 400;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = 'rgba(255,200,230,0.10)';
      ctx.fillRect(gx - 90, y0, 180, y1 - y0);
      ctx.restore();
    }
    // foam edge
    ctx.strokeStyle = 'rgba(190,220,255,0.35)';
    ctx.lineWidth = 4;
    const foamY = wtr.kind === 'harbor' ? wtr.y1 - 2 : wtr.y0 + 2;
    const wob = Math.sin(t * 1.8) * 3;
    ctx.beginPath();
    ctx.moveTo(x0, foamY + wob);
    ctx.lineTo(x1, foamY - wob);
    ctx.stroke();
  }

  // airfield tarmac
  if (vis.x1 > CFG.AIR_W - 200) {
    ctx.fillStyle = COLORS.asphalt2;
    ctx.fillRect(Math.max(vis.x0, CFG.AIR_W - 160), 1300, vis.x1 - Math.max(vis.x0, CFG.AIR_W - 160), 1200);
    // runway
    ctx.fillStyle = '#191922';
    ctx.fillRect(CFG.AIR_W - 40, 1900, CFG.W - CFG.AIR_W + 40, 160);
    ctx.strokeStyle = '#d8d8e0';
    ctx.lineWidth = 4;
    ctx.setLineDash([46, 34]);
    ctx.beginPath();
    ctx.moveTo(CFG.AIR_W - 30, 1978);
    ctx.lineTo(CFG.W - 10, 1978);
    ctx.stroke();
    ctx.setLineDash([]);
  }
}

// ---------------------------------------------------------------- roads
function drawRoads(game, ctx, vis) {
  const w = game.world;
  const RW = CFG.ROAD_W;
  ctx.fillStyle = COLORS.road;
  for (const y of w.roadH) {
    if (y + RW < vis.y0 || y - RW > vis.y1) continue;
    ctx.fillRect(Math.max(vis.x0, 0), y - RW / 2, Math.min(vis.x1, CFG.AIR_W) - Math.max(vis.x0, 0), RW);
  }
  for (const x of w.roadV) {
    if (x + RW < vis.x0 || x - RW > vis.x1) continue;
    ctx.fillRect(x - RW / 2, Math.max(vis.y0, CFG.DOCKS_S - RW), RW, Math.min(vis.y1, CFG.SAND_S) - Math.max(vis.y0, CFG.DOCKS_S - RW));
  }
  // lane dashes
  ctx.strokeStyle = COLORS.roadLine;
  ctx.lineWidth = 3;
  ctx.setLineDash([26, 30]);
  for (const y of w.roadH) {
    if (y < vis.y0 - 40 || y > vis.y1 + 40) continue;
    ctx.beginPath();
    ctx.moveTo(Math.max(vis.x0, 0), y);
    ctx.lineTo(Math.min(vis.x1, CFG.AIR_W), y);
    ctx.stroke();
  }
  for (const x of w.roadV) {
    if (x < vis.x0 - 40 || x > vis.x1 + 40) continue;
    ctx.beginPath();
    ctx.moveTo(x, Math.max(vis.y0, CFG.DOCKS_S));
    ctx.lineTo(x, Math.min(vis.y1, CFG.SAND_S));
    ctx.stroke();
  }
  ctx.setLineDash([]);

  // crosswalks at controlled intersections + traffic lights
  const t = game.t;
  for (const L of w.lights) {
    if (L.x < vis.x0 - 100 || L.x > vis.x1 + 100 || L.y < vis.y0 - 100 || L.y > vis.y1 + 100) continue;
    const phase = w.lightPhase(L.ix, L.iy, t);
    ctx.fillStyle = 'rgba(220,220,230,0.13)';
    for (const off of [-RW / 2 - 12, RW / 2 + 4]) {
      ctx.fillRect(L.x - RW / 2, L.y + off, RW, 8);
      ctx.fillRect(L.x + off, L.y - RW / 2, 8, RW);
    }
    // light heads on posts
    const greenNS = phase === 'ns';
    ctx.fillStyle = greenNS ? '#6dff8a' : '#ff5d5d';
    ctx.beginPath(); ctx.arc(L.x + RW / 2 + 12, L.y - RW / 2 - 12, 4, 0, TAU); ctx.fill();
    ctx.fillStyle = greenNS ? '#ff5d5d' : '#6dff8a';
    ctx.beginPath(); ctx.arc(L.x - RW / 2 - 12, L.y + RW / 2 + 12, 4, 0, TAU); ctx.fill();
  }
}

// ---------------------------------------------------------------- zone props
function drawZoneProps(game, ctx, vis) {
  const w = game.world;
  // beach props + palms
  for (const prop of w.props) {
    if (prop.x < vis.x0 - 400 || prop.x > vis.x1 + 400 || prop.y < vis.y0 - 400 || prop.y > vis.y1 + 400) continue;
    drawProp(game, ctx, prop, vis);
  }
  // palms
  for (const p of w.palms) {
    if (p.x < vis.x0 - 60 || p.x > vis.x1 + 60 || p.y < vis.y0 - 60 || p.y > vis.y1 + 60) continue;
    // shadow
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.beginPath(); ctx.ellipse(p.x + 10, p.y + 6, 14 * p.s, 6 * p.s, 0, 0, TAU); ctx.fill();
    // trunk
    ctx.strokeStyle = '#5a4632';
    ctx.lineWidth = 5 * p.s;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.quadraticCurveTo(p.x + 6, p.y - 14, p.x + 3, p.y - 26 * p.s);
    ctx.stroke();
    // fronds
    ctx.strokeStyle = '#2f7a3f';
    ctx.lineWidth = 3.4 * p.s;
    const sway = Math.sin(game.t * 1.2 + p.x) * 3;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU + 0.3;
      ctx.beginPath();
      ctx.moveTo(p.x + 3, p.y - 26 * p.s);
      ctx.quadraticCurveTo(p.x + 3 + Math.cos(a) * 16 * p.s, p.y - 26 * p.s + Math.sin(a) * 16 * p.s - 6, p.x + 3 + Math.cos(a) * 24 * p.s + sway, p.y - 26 * p.s + Math.sin(a) * 20 * p.s + 4);
      ctx.stroke();
    }
  }
  // street lamps: pole + warm pool of light
  for (const l of w.lamps) {
    if (l.x < vis.x0 - 80 || l.x > vis.x1 + 80 || l.y < vis.y0 - 80 || l.y > vis.y1 + 80) continue;
    const g = ctx.createRadialGradient(l.x, l.y, 4, l.x, l.y, 66);
    g.addColorStop(0, 'rgba(255,214,140,0.16)');
    g.addColorStop(1, 'rgba(255,214,140,0)');
    ctx.fillStyle = g;
    ctx.fillRect(l.x - 66, l.y - 66, 132, 132);
    ctx.fillStyle = '#3a3a48';
    ctx.fillRect(l.x - 2, l.y - 2, 4, 4);
    ctx.fillStyle = '#ffd68c';
    ctx.beginPath(); ctx.arc(l.x, l.y, 2.6, 0, TAU); ctx.fill();
  }
}

function drawProp(game, ctx, prop, vis) {
  switch (prop.kind) {
    case 'shopfront': {
      const { x, y, w, h, color, label } = prop;
      ctx.fillStyle = '#23232f';
      ctx.fillRect(x - w / 2, y - h / 2, w, h);
      // awning
      ctx.fillStyle = color;
      ctx.fillRect(x - w / 2, y - h / 2, w, 14);
      for (let i = 0; i < w / 10; i++) {
        if (i % 2 === 0) { ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.fillRect(x - w / 2 + i * 10, y - h / 2, 10, 14); ctx.fillStyle = color; }
      }
      // sign
      ctx.save();
      ctx.font = 'bold 12px "Segoe UI", sans-serif';
      ctx.textAlign = 'center';
      ctx.shadowColor = color; ctx.shadowBlur = 10;
      ctx.fillStyle = color;
      ctx.fillText(label, x, y - h / 2 - 8);
      ctx.restore();
      // door + window
      ctx.fillStyle = '#111118';
      ctx.fillRect(x - 12, y + h / 2 - 24, 24, 24);
      ctx.fillStyle = 'rgba(255,214,140,0.25)';
      ctx.fillRect(x - w / 2 + 10, y - h / 2 + 24, w - 20, 18);
      break;
    }
    case 'lot': {
      const { x, y, cols, rows } = prop;
      ctx.fillStyle = '#16161e';
      ctx.fillRect(x - cols * 34, y - rows * 56, cols * 68, rows * 112);
      ctx.strokeStyle = 'rgba(255,214,140,0.35)';
      ctx.lineWidth = 2;
      for (let i = 0; i <= cols; i++) {
        for (let j = 0; j < rows; j++) {
          const sx = x - cols * 34 + i * 68;
          const sy = y - rows * 56 + j * 112;
          ctx.strokeRect(sx + 4, sy + 8, 60, 96);
        }
      }
      break;
    }
    case 'billboard': {
      const { x, y, art } = prop;
      ctx.fillStyle = '#2a2a36';
      ctx.fillRect(x - 44, y - 34, 88, 52);
      ctx.fillStyle = '#15151c';
      ctx.fillRect(x - 40, y - 30, 80, 44);
      ctx.save();
      ctx.font = 'bold 11px "Segoe UI", sans-serif';
      ctx.textAlign = 'center';
      const flick = Math.sin(game.t * 9 + x) > -0.9;
      ctx.shadowColor = art.color; ctx.shadowBlur = flick ? 12 : 0;
      ctx.fillStyle = art.color;
      wrapText(ctx, art.text, x, y - 8, 76, 12);
      ctx.restore();
      // legs
      ctx.strokeStyle = '#2a2a36';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(x - 30, y + 18); ctx.lineTo(x - 30, y + 34);
      ctx.moveTo(x + 30, y + 18); ctx.lineTo(x + 30, y + 34);
      ctx.stroke();
      break;
    }
    case 'busstop': {
      ctx.fillStyle = 'rgba(160,200,255,0.15)';
      ctx.fillRect(prop.x - 26, prop.y - 18, 52, 36);
      ctx.strokeStyle = '#3c4456';
      ctx.lineWidth = 3;
      ctx.strokeRect(prop.x - 26, prop.y - 18, 52, 36);
      ctx.fillStyle = '#00e5ff';
      ctx.font = 'bold 9px "Segoe UI", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('BUS', prop.x, prop.y + 3);
      ctx.textAlign = 'left';
      break;
    }
    case 'dumpster': {
      ctx.fillStyle = '#2f5a3a';
      ctx.fillRect(prop.x - 16, prop.y - 8, 32, 16);
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(prop.x - 16, prop.y - 8, 32, 5);
      break;
    }
    case 'hydrant': {
      ctx.fillStyle = '#c23b3b';
      ctx.beginPath(); ctx.arc(prop.x, prop.y, 4, 0, TAU); ctx.fill();
      ctx.fillRect(prop.x - 2, prop.y - 8, 4, 8);
      break;
    }
    case 'bench': {
      ctx.fillStyle = '#5a4632';
      ctx.fillRect(prop.x - 18, prop.y - 4, 36, 8);
      ctx.fillStyle = '#3c3022';
      ctx.fillRect(prop.x - 18, prop.y - 8, 36, 4);
      break;
    }
    case 'bin': {
      ctx.fillStyle = '#3c4456';
      ctx.beginPath(); ctx.arc(prop.x, prop.y, 6, 0, TAU); ctx.fill();
      break;
    }
    case 'court': {
      ctx.fillStyle = '#2c4a3a';
      ctx.fillRect(prop.x - 60, prop.y - 30, 120, 60);
      ctx.strokeStyle = 'rgba(255,255,255,0.25)';
      ctx.strokeRect(prop.x - 60, prop.y - 30, 120, 60);
      ctx.beginPath();
      ctx.moveTo(prop.x, prop.y - 30); ctx.lineTo(prop.x, prop.y + 30);
      ctx.stroke();
      // net
      ctx.strokeStyle = '#c9c9d4';
      ctx.beginPath();
      ctx.moveTo(prop.x, prop.y - 26); ctx.lineTo(prop.x, prop.y + 26);
      ctx.stroke();
      break;
    }
    case 'boardwalk': {
      ctx.fillStyle = '#4a3c28';
      ctx.fillRect(prop.x0, prop.y - 16, prop.x1 - prop.x0, 32);
      ctx.strokeStyle = 'rgba(0,0,0,0.3)';
      ctx.lineWidth = 1.4;
      for (let x = prop.x0; x < prop.x1; x += 26) {
        ctx.beginPath(); ctx.moveTo(x, prop.y - 16); ctx.lineTo(x, prop.y + 16); ctx.stroke();
      }
      break;
    }
    case 'drums': {
      for (let i = 0; i < 2; i++) {
        ctx.fillStyle = '#b3452c';
        ctx.beginPath(); ctx.arc(prop.x + i * 14, prop.y, 6, 0, TAU); ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.4)';
        ctx.beginPath(); ctx.arc(prop.x + i * 14, prop.y, 6, 0, TAU); ctx.stroke();
      }
      break;
    }
    case 'windsock': {
      ctx.strokeStyle = '#8a93a2';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(prop.x, prop.y); ctx.lineTo(prop.x, prop.y - 26); ctx.stroke();
      const sway = Math.sin(game.t * 2.2) * 6;
      ctx.fillStyle = '#ff5d2c';
      ctx.beginPath();
      ctx.moveTo(prop.x, prop.y - 26);
      ctx.lineTo(prop.x + 24 + sway, prop.y - 22);
      ctx.lineTo(prop.x + 24 + sway, prop.y - 16);
      ctx.lineTo(prop.x, prop.y - 18);
      ctx.closePath(); ctx.fill();
      break;
    }
    case 'stall': {
      // market stall: striped canopy over crates
      ctx.fillStyle = '#6a5a3a';
      ctx.fillRect(prop.x - 28, prop.y - 6, 56, 12);
      for (let i = 0; i < 5; i++) {
        ctx.fillStyle = i % 2 ? '#f2f2f2' : prop.color;
        ctx.fillRect(prop.x - 30 + i * 12, prop.y - 14, 12, 7);
      }
      ctx.fillStyle = '#8cff5d';
      ctx.beginPath(); ctx.arc(prop.x - 12, prop.y, 3, 0, TAU); ctx.fill();
      ctx.fillStyle = '#e06a2c';
      ctx.beginPath(); ctx.arc(prop.x + 8, prop.y + 1, 3, 0, TAU); ctx.fill();
      break;
    }
    case 'oldfountain': {
      ctx.fillStyle = '#4a3a30';
      ctx.fillRect(prop.x - 24, prop.y - 24, 48, 48);
      ctx.fillStyle = '#3a6a8a';
      ctx.fillRect(prop.x - 17, prop.y - 17, 34, 34);
      const t2 = game.t * 2.6;
      ctx.fillStyle = 'rgba(180,220,255,0.55)';
      ctx.beginPath(); ctx.arc(prop.x + Math.sin(t2) * 5, prop.y - 4 + Math.cos(t2 * 1.4) * 4, 3.4, 0, TAU); ctx.fill();
      break;
    }
    case 'site': {
      // dirt foundation with rebar sticks
      ctx.fillStyle = '#3a3226';
      ctx.fillRect(prop.x - prop.w / 2, prop.y - prop.h / 2, prop.w, prop.h);
      ctx.fillStyle = '#2a2418';
      ctx.fillRect(prop.x - 60, prop.y - 40, 80, 70);
      ctx.strokeStyle = '#6a6252';
      ctx.lineWidth = 2;
      for (let i = 0; i < 6; i++) {
        const bx = prop.x - 52 + i * 13;
        ctx.beginPath(); ctx.moveTo(bx, prop.y + 22); ctx.lineTo(bx + 3, prop.y + 2); ctx.stroke();
      }
      break;
    }
    case 'minicrane': {
      ctx.fillStyle = '#d8a020';
      ctx.fillRect(prop.x - 8, prop.y - 60, 16, 66);
      ctx.fillRect(prop.x - 50, prop.y - 56, 100, 10);
      ctx.strokeStyle = '#8a6e20';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(prop.x, prop.y + 4); ctx.lineTo(prop.x + 34, prop.y - 30); ctx.stroke();
      ctx.strokeRect(prop.x + 28, prop.y - 18, 26, 16);
      break;
    }
    case 'cone': {
      ctx.fillStyle = '#e06a2c';
      ctx.beginPath(); ctx.moveTo(prop.x, prop.y - 7); ctx.lineTo(prop.x - 5, prop.y + 5); ctx.lineTo(prop.x + 5, prop.y + 5); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#f2f2f2';
      ctx.fillRect(prop.x - 3, prop.y - 3, 6, 3);
      break;
    }
    case 'barrier': {
      ctx.fillStyle = '#d8a020';
      ctx.fillRect(prop.x - 16, prop.y - 5, 32, 10);
      ctx.fillStyle = '#20242e';
      for (let i = 0; i < 3; i++) ctx.fillRect(prop.x - 14 + i * 11, prop.y - 5, 5, 10);
      break;
    }
    case 'plaza': {
      ctx.fillStyle = '#262633';
      ctx.fillRect(prop.x - prop.w / 2, prop.y - prop.h / 2, prop.w, prop.h);
      ctx.strokeStyle = 'rgba(255,255,255,0.07)';
      ctx.lineWidth = 2;
      for (let gx = prop.x - prop.w / 2; gx <= prop.x + prop.w / 2; gx += 28) {
        ctx.beginPath(); ctx.moveTo(gx, prop.y - prop.h / 2); ctx.lineTo(gx, prop.y + prop.h / 2); ctx.stroke();
      }
      for (let gy = prop.y - prop.h / 2; gy <= prop.y + prop.h / 2; gy += 28) {
        ctx.beginPath(); ctx.moveTo(prop.x - prop.w / 2, gy); ctx.lineTo(prop.x + prop.w / 2, gy); ctx.stroke();
      }
      break;
    }
    case 'planter': {
      ctx.fillStyle = '#3c3526';
      ctx.beginPath(); ctx.arc(prop.x, prop.y, 12, 0, TAU); ctx.fill();
      ctx.fillStyle = '#2f7a3f';
      ctx.beginPath(); ctx.arc(prop.x, prop.y, 8, 0, TAU); ctx.fill();
      break;
    }
    case 'boat': {
      ctx.save();
      ctx.translate(prop.x, prop.y);
      ctx.fillStyle = '#c9c9d4';
      ctx.beginPath();
      ctx.moveTo(-prop.len / 2, -14);
      ctx.lineTo(prop.len / 2 - 16, -14);
      ctx.quadraticCurveTo(prop.len / 2, 0, prop.len / 2 - 16, 14);
      ctx.lineTo(-prop.len / 2, 14);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#20242e';
      ctx.fillRect(-prop.len / 2 + 16, -8, 20, 16);
      ctx.restore();
      break;
    }
    case 'pallets': {
      ctx.fillStyle = '#6a5a3a';
      ctx.fillRect(prop.x - 18, prop.y - 12, 36, 24);
      ctx.strokeStyle = 'rgba(0,0,0,0.4)';
      for (let i = 0; i < 4; i++) {
        ctx.beginPath(); ctx.moveTo(prop.x - 18, prop.y - 12 + i * 8); ctx.lineTo(prop.x + 18, prop.y - 12 + i * 8); ctx.stroke();
      }
      break;
    }
    case 'docklamp': {
      const g2 = ctx.createRadialGradient(prop.x, prop.y, 4, prop.x, prop.y, 54);
      g2.addColorStop(0, 'rgba(160,220,255,0.14)');
      g2.addColorStop(1, 'rgba(160,220,255,0)');
      ctx.fillStyle = g2;
      ctx.fillRect(prop.x - 54, prop.y - 54, 108, 108);
      ctx.fillStyle = '#a0dcff';
      ctx.beginPath(); ctx.arc(prop.x, prop.y, 3, 0, TAU); ctx.fill();
      break;
    }
    case 'umbrella': {
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath(); ctx.ellipse(prop.x + 4, prop.y + 4, 16, 7, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = prop.color;
      ctx.beginPath(); ctx.arc(prop.x, prop.y, 15, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.lineWidth = 2;
      for (let i = 0; i < 3; i++) {
        ctx.beginPath(); ctx.moveTo(prop.x - 15 + i * 15, prop.y - 8); ctx.lineTo(prop.x - 8 + i * 8, prop.y + 12); ctx.stroke();
      }
      break;
    }
    case 'surfboard': {
      ctx.save();
      ctx.translate(prop.x, prop.y);
      ctx.rotate(Math.PI / 2 + Math.sin(game.t + prop.x) * 0.05);
      ctx.fillStyle = '#ffd166';
      ctx.beginPath(); ctx.ellipse(0, 0, 16, 4, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#c26a2f';
      ctx.beginPath(); ctx.moveTo(-14, 0); ctx.lineTo(14, 0); ctx.stroke();
      ctx.restore();
      break;
    }
    case 'meter': {
      ctx.fillStyle = '#3c4456';
      ctx.fillRect(prop.x - 2, prop.y - 8, 4, 10);
      ctx.fillStyle = '#5a6a7a';
      ctx.fillRect(prop.x - 3, prop.y - 12, 6, 5);
      break;
    }
    case 'mailbox': {
      ctx.fillStyle = '#2f5a8a';
      ctx.fillRect(prop.x - 6, prop.y - 9, 12, 10);
      ctx.fillRect(prop.x - 1, prop.y + 1, 2, 5);
      break;
    }
    case 'pier': {
      ctx.fillStyle = '#4a3c28';
      ctx.fillRect(prop.x - prop.w / 2, CFG.HARBOR_N - 240, prop.w, prop.h);
      ctx.strokeStyle = '#5c4c34';
      ctx.lineWidth = 2;
      for (let y = CFG.HARBOR_N - 236; y < CFG.DOCKS_S; y += 22) {
        ctx.beginPath(); ctx.moveTo(prop.x - prop.w / 2, y); ctx.lineTo(prop.x + prop.w / 2, y); ctx.stroke();
      }
      break;
    }
    case 'crane': {
      ctx.fillStyle = '#b3922c';
      ctx.fillRect(prop.x - 10, CFG.HARBOR_N - 260, 20, 270);
      ctx.fillRect(prop.x - 90, CFG.HARBOR_N - 250, 180, 12);
      ctx.strokeStyle = '#8a6e20';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(prop.x - 80, CFG.HARBOR_N - 240); ctx.lineTo(prop.x, CFG.HARBOR_N - 180); ctx.stroke();
      // hanging container
      const sw = Math.sin(game.t * 0.7 + prop.x) * 8;
      ctx.strokeRect(prop.x + 46 + sw, CFG.HARBOR_N - 200, 44, 22);
      break;
    }
    case 'ship': {
      ctx.fillStyle = '#252b38';
      ctx.beginPath();
      const bow = prop.x + prop.w / 2;
      ctx.moveTo(prop.x - prop.w / 2, prop.y - prop.h / 2);
      ctx.lineTo(bow - 30, prop.y - prop.h / 2);
      ctx.lineTo(bow, prop.y);
      ctx.lineTo(bow - 30, prop.y + prop.h / 2);
      ctx.lineTo(prop.x - prop.w / 2, prop.y + prop.h / 2);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#c23434';
      ctx.fillRect(prop.x - prop.w / 2 + 20, prop.y - 40, 60, 80);
      ctx.fillStyle = '#ffd166';
      for (let i = 0; i < 5; i++) ctx.fillRect(prop.x - 60 + i * 26, prop.y - 8, 14, 4);
      break;
    }
    case 'dockshed': case 'beachhut': {
      ctx.fillStyle = prop.kind === 'beachhut' ? '#c96a8a' : '#3a4456';
      ctx.fillRect(prop.x - prop.w / 2, prop.y - prop.h / 2, prop.w, prop.h);
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.fillRect(prop.x - prop.w / 2, prop.y - prop.h / 2, prop.w, 10);
      ctx.fillStyle = prop.kind === 'beachhut' ? '#ffd9e4' : '#ffd166';
      ctx.fillRect(prop.x - 12, prop.y - prop.h / 2 + 16, 24, 12);
      break;
    }
    case 'lifeguard': {
      ctx.fillStyle = '#d84f4f';
      ctx.fillRect(prop.x - 14, prop.y - 30, 28, 34);
      ctx.fillStyle = '#f2f2f2';
      ctx.fillRect(prop.x - 18, prop.y - 38, 36, 8);
      break;
    }
    case 'fountain': {
      ctx.fillStyle = '#2c3a4a';
      ctx.beginPath(); ctx.arc(prop.x, prop.y, 26, 0, TAU); ctx.fill();
      ctx.fillStyle = '#3a6a8a';
      ctx.beginPath(); ctx.arc(prop.x, prop.y, 20, 0, TAU); ctx.fill();
      const t = game.t * 3;
      ctx.fillStyle = 'rgba(180,220,255,0.5)';
      ctx.beginPath(); ctx.arc(prop.x + Math.sin(t) * 4, prop.y - 6 + Math.cos(t * 1.3) * 3, 4, 0, TAU); ctx.fill();
      break;
    }
    case 'hangar': {
      ctx.fillStyle = '#2e3542';
      ctx.beginPath();
      ctx.moveTo(prop.x - prop.w / 2, prop.y + prop.h / 2);
      ctx.lineTo(prop.x - prop.w / 2, prop.y);
      ctx.quadraticCurveTo(prop.x, prop.y - prop.h * 0.7, prop.x + prop.w / 2, prop.y);
      ctx.lineTo(prop.x + prop.w / 2, prop.y + prop.h / 2);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#151a22';
      ctx.fillRect(prop.x - 30, prop.y + prop.h / 2 - 34, 60, 34);
      ctx.fillStyle = '#ffd166';
      ctx.font = 'bold 13px "Segoe UI", sans-serif';
      ctx.fillText('HANGAR ' + (Math.round(prop.x / 300) - 13), prop.x - 34, prop.y + 4);
      break;
    }
    case 'tower': {
      ctx.fillStyle = '#3a4456';
      ctx.fillRect(prop.x - 16, prop.y - 60, 32, 70);
      ctx.fillStyle = '#262e3a';
      ctx.fillRect(prop.x - 26, prop.y - 80, 52, 26);
      const blink = Math.sin(game.t * 4) > 0;
      ctx.fillStyle = blink ? '#ff4a4a' : '#571a1a';
      ctx.beginPath(); ctx.arc(prop.x, prop.y - 86, 3.4, 0, TAU); ctx.fill();
      break;
    }
    case 'runway': break;
    case 'plane': {
      ctx.save();
      ctx.translate(prop.x, prop.y);
      ctx.fillStyle = '#8a93a2';
      ctx.beginPath();
      ctx.ellipse(0, 0, 44, 10, 0, 0, TAU); ctx.fill();
      ctx.fillRect(-6, -34, 12, 68);
      ctx.fillRect(-40, -12, 10, 24);
      ctx.fillStyle = '#c23434';
      ctx.fillRect(30, -3, 12, 6);
      ctx.restore();
      break;
    }
    case 'marina': {
      ctx.fillStyle = '#3a4456';
      ctx.fillRect(prop.x - 40, prop.y - 26, 80, 52);
      ctx.fillStyle = '#00e5ff';
      ctx.font = 'bold 14px "Segoe UI", sans-serif';
      ctx.fillText('MARINA', prop.x - 30, prop.y + 5);
      break;
    }
  }
}

// ---------------------------------------------------------------- buildings
function drawBuildings(game, ctx, vis) {
  const w = game.world;
  for (const b of w.buildings) {
    if (b.x1 < vis.x0 || b.x0 > vis.x1 || b.y1 < vis.y0 || b.y0 > vis.y1) continue;
    if (b.container) {
      drawContainer(ctx, b);
      continue;
    }
    // glass towers: cool reflective face with lit window columns
    if (b.glass) {
      const gG = ctx.createLinearGradient(b.x0, b.y0, b.x1, b.y1);
      gG.addColorStop(0, '#22344a');
      gG.addColorStop(0.5, '#1c2a3a');
      gG.addColorStop(1, '#182232');
      ctx.fillStyle = gG;
      ctx.fillRect(b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0);
      ctx.strokeStyle = 'rgba(140,190,255,0.18)';
      ctx.lineWidth = 1.4;
      for (let gx = b.x0 + 12; gx < b.x1; gx += 18) {
        ctx.beginPath(); ctx.moveTo(gx, b.y0 + 6); ctx.lineTo(gx, b.y1 - 6); ctx.stroke();
      }
      for (let gy = b.y0 + 12; gy < b.y1; gy += 18) {
        ctx.beginPath(); ctx.moveTo(b.x0 + 6, gy); ctx.lineTo(b.x1 - 6, gy); ctx.stroke();
      }
      // sky reflection smear
      ctx.fillStyle = 'rgba(150,200,255,0.08)';
      ctx.fillRect(b.x0 + (b.x1 - b.x0) * 0.2, b.y0, (b.x1 - b.x0) * 0.16, b.y1 - b.y0);
      continue;
    }
    // old town brick: warm brick courses + fire escapes
    if (b.brick) {
      ctx.fillStyle = b.color;
      ctx.fillRect(b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0);
      ctx.strokeStyle = 'rgba(0,0,0,0.28)';
      ctx.lineWidth = 1.2;
      for (let by = b.y0 + 8; by < b.y1; by += 8) {
        ctx.beginPath(); ctx.moveTo(b.x0 + 2, by); ctx.lineTo(b.x1 - 2, by); ctx.stroke();
      }
      // fire escape zig-zag on the right face
      ctx.strokeStyle = '#1a1a22';
      ctx.lineWidth = 2.4;
      let fy = b.y0 + 14;
      let fx = b.x1 - 14;
      ctx.beginPath();
      ctx.moveTo(fx, fy);
      for (let i = 0; i < 4 && fy < b.y1 - 10; i++) {
        fy += 22;
        fx = i % 2 ? b.x1 - 14 : b.x1 - 30;
        ctx.lineTo(fx, fy);
      }
      ctx.stroke();
      continue;
    }
    ctx.fillStyle = b.color;
    ctx.fillRect(b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0);
    // roof edge highlight
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 2;
    ctx.strokeRect(b.x0 + 1, b.y0 + 1, b.x1 - b.x0 - 2, b.y1 - b.y0 - 2);
    // rooftop AC units on taller buildings
    if (b.ac) {
      const cx2 = (b.x0 + b.x1) / 2, cy2 = (b.y0 + b.y1) / 2;
      ctx.fillStyle = '#3a3a46';
      ctx.fillRect(cx2 - 12, cy2 - 9, 24, 18);
      ctx.fillStyle = '#22222c';
      ctx.beginPath(); ctx.arc(cx2, cy2, 6, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#4a4a58';
      ctx.beginPath(); ctx.arc(cx2, cy2, 6, game.t * 6 % TAU, game.t * 6 % TAU + 2.2); ctx.stroke();
    }
    // rooftop pool: glowing cyan rectangle with a ladder
    if (b.pool) {
      const cx2 = b.x0 + 18, cy2 = b.y0 + 16;
      ctx.fillStyle = 'rgba(70,180,230,0.65)';
      ctx.fillRect(cx2, cy2, 26, 18);
      ctx.strokeStyle = 'rgba(200,240,255,0.5)';
      ctx.lineWidth = 1.4;
      ctx.strokeRect(cx2, cy2, 26, 18);
      const ripple = Math.sin(game.t * 3 + b.x0) * 2;
      ctx.beginPath();
      ctx.moveTo(cx2 + 4, cy2 + 9 + ripple);
      ctx.lineTo(cx2 + 22, cy2 + 9 - ripple);
      ctx.stroke();
    }
    // neon window band around the roofline
    if (b.band) {
      ctx.save();
      ctx.strokeStyle = b.band;
      ctx.shadowColor = b.band; ctx.shadowBlur = 10;
      ctx.lineWidth = 2.4;
      const blink = Math.sin(game.t * 6 + b.y0) > -0.9;
      if (blink) ctx.strokeRect(b.x0 + 5, b.y0 + 5, b.x1 - b.x0 - 10, 5);
      ctx.restore();
    }
    // entrance canopy on the street-facing edge
    if (b.canopy) {
      const cx2 = (b.x0 + b.x1) / 2;
      const cy2 = b.canopy.side === 'n' ? b.y0 : b.y1;
      ctx.fillStyle = b.canopy.color;
      ctx.fillRect(cx2 - 20, cy2 - (b.canopy.side === 'n' ? 8 : 0), 40, 8);
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.fillRect(cx2 - 20, cy2 - (b.canopy.side === 'n' ? 8 : 0), 40, 2);
    }
    // mural art on the face
    if (b.mural) {
      const mx = (b.x0 + b.x1) / 2, my = (b.y0 + b.y1) / 2;
      ctx.save();
      if (b.mural.kind === 'flamingo') {
        ctx.fillStyle = b.mural.color;
        ctx.beginPath();
        ctx.ellipse(mx, my, 10, 16, 0.3, 0, TAU);
        ctx.fill();
        ctx.strokeStyle = b.mural.color;
        ctx.lineWidth = 2.4;
        ctx.beginPath(); ctx.moveTo(mx + 8, my + 12); ctx.lineTo(mx + 8, my + 26); ctx.stroke();
        ctx.fillStyle = '#111';
        ctx.beginPath(); ctx.arc(mx - 6, my - 10, 2, 0, TAU); ctx.fill();
      } else if (b.mural.kind === 'sunset') {
        const gM = ctx.createLinearGradient(mx, my - 20, mx, my + 20);
        gM.addColorStop(0, b.mural.color);
        gM.addColorStop(1, '#c23434');
        ctx.fillStyle = gM;
        ctx.beginPath(); ctx.arc(mx, my, 14, 0, TAU); ctx.fill();
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        for (let i = 0; i < 3; i++) ctx.fillRect(mx - 16, my - 6 + i * 8, 32, 3);
      } else {
        ctx.strokeStyle = b.mural.color;
        ctx.lineWidth = 3;
        for (let i = 0; i < 3; i++) {
          ctx.beginPath();
          ctx.moveTo(mx - 16, my - 8 + i * 9);
          ctx.quadraticCurveTo(mx, my - 16 + i * 9, mx + 16, my - 8 + i * 9);
          ctx.stroke();
        }
      }
      ctx.restore();
    }
    // windows
    const rows = b.lit.length, bw = b.x1 - b.x0;
    const n = Math.max(2, Math.floor(bw / 26));
    for (let f = 0; f < rows; f++) {
      const wy = b.y0 + 10 + f * ((b.y1 - b.y0 - 20) / Math.max(1, rows));
      for (let k = 0; k < n; k++) {
        let litv = b.lit[f][k] ?? 0;
        // late-night flicker: some windows toggle slowly
        if (litv && ((b.x0 * 31 + f * 7 + k) % 7) === 0) {
          litv = Math.sin(game_time() * 0.7 + b.x0 * 0.01 + f) > -0.2 ? litv : 0;
        }
        if (!litv) continue;
        ctx.fillStyle = litv === 1 ? 'rgba(255,214,140,0.75)' : litv === 2 ? 'rgba(160,220,255,0.6)' : 'rgba(255,120,160,0.5)';
        ctx.fillRect(b.x0 + 8 + k * 26, wy, 12, 9);
      }
    }
  }
  // neon sign text on building faces
  for (const s of w.neonSigns) {
    if (s.x < vis.x0 - 100 || s.x > vis.x1 + 100 || s.y < vis.y0 - 100 || s.y > vis.y1 + 100) continue;
    drawNeonText(ctx, s);
  }
}

function drawContainer(ctx, b) {
  ctx.fillStyle = b.color;
  ctx.fillRect(b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0);
  ctx.strokeStyle = 'rgba(0,0,0,0.4)';
  ctx.lineWidth = 2;
  for (let x = b.x0 + 6; x < b.x1; x += 9) {
    ctx.beginPath(); ctx.moveTo(x, b.y0 + 2); ctx.lineTo(x, b.y1 - 2); ctx.stroke();
  }
  if (b.stack > 1) {
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(b.x0 + 4, b.y0 - 10, (b.x1 - b.x0) - 8, 10);
  }
}

function drawNeonText(ctx, s) {
  const flick = Math.sin(game_time() * 17 + s.x) > -0.85;
  if (!flick) return;
  ctx.save();
  ctx.font = 'bold 17px "Segoe UI", sans-serif';
  ctx.textAlign = 'center';
  ctx.shadowColor = s.color;
  ctx.shadowBlur = 16;
  ctx.fillStyle = s.color;
  if (s.vert === 1) {
    for (let i = 0; i < s.text.length; i++) {
      ctx.fillText(s.text[i], s.x + 13, s.y - 6 + i * 18);
    }
  } else {
    for (let i = 0; i < s.text.length; i++) {
      ctx.fillText(s.text[i], s.x - 13, s.y - 6 + i * 18);
    }
  }
  ctx.restore();
}

// ---------------------------------------------------------------- entities
function drawMarkers(game, ctx) {
  for (const m of game.missions.markers) {
    const pulse = 0.6 + Math.sin(game.t * 3) * 0.25;
    ctx.save();
    ctx.globalAlpha = 0.85;
    const g = ctx.createRadialGradient(m.x, m.y, 4, m.x, m.y, m.r);
    g.addColorStop(0, m.color + 'cc');
    g.addColorStop(1, m.color + '11');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(m.x, m.y, m.r * pulse, 0, TAU); ctx.fill();
    ctx.strokeStyle = m.color;
    ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(m.x, m.y, m.r * pulse, 0, TAU); ctx.stroke();
    if (m.label) {
      ctx.font = 'bold 12px "Segoe UI", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = m.color;
      ctx.shadowColor = m.color; ctx.shadowBlur = 8;
      ctx.fillText(m.label, m.x, m.y - m.r - 8);
    }
    ctx.restore();
  }
  // spike strips laid by the VPD
  for (const s of game.police.spikes || []) {
    if (s.life <= 0) continue;
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 2;
    ctx.strokeRect(s.x0, s.y0, s.x1 - s.x0, s.y1 - s.y0);
    ctx.fillStyle = 'rgba(255,80,80,0.35)';
    const blink = Math.floor(game.t * 5) % 2 === 0;
    if (blink) ctx.fillRect(s.x0, s.y0, s.x1 - s.x0, s.y1 - s.y0);
    // spikes
    ctx.fillStyle = '#c9c9d4';
    const step = 14;
    if (s.axis === 'h') for (let x = s.x0 + 4; x < s.x1; x += step) ctx.fillRect(x, s.y0 - 3, 2, 6);
    else for (let y = s.y0 + 4; y < s.y1; y += step) ctx.fillRect(s.x0 - 3, y, 6, 2);
    ctx.restore();
  }
}

function drawRamps(game, ctx) {
  for (const r of RAMP_SPOTS) {
    if (r.x < game.vis.x0 - 80 || r.x > game.vis.x1 + 80 || r.y < game.vis.y0 - 80 || r.y > game.vis.y1 + 80) continue;
    ctx.save();
    ctx.translate(r.x, r.y);
    ctx.rotate(r.h);
    // striped launch wedge
    ctx.fillStyle = '#20242e';
    ctx.fillRect(-22, -16, 44, 32);
    for (let i = 0; i < 4; i++) {
      ctx.fillStyle = i % 2 ? '#ffd166' : '#20242e';
      ctx.fillRect(-22 + i * 11, -16, 11, 32);
    }
    ctx.strokeStyle = 'rgba(255,209,102,0.5)';
    ctx.lineWidth = 2;
    ctx.strokeRect(-22, -16, 44, 32);
    ctx.restore();
  }
  // airtime meter while airborne
  if (game.jumps && game.jumps.airborne) {
    const p = game.player;
    if (p.inCar) {
      ctx.save();
      ctx.font = '800 20px "Segoe UI", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#8ac9ff';
      ctx.shadowColor = '#8ac9ff'; ctx.shadowBlur = 10;
      ctx.fillText('AIR ' + game.jumps.airT.toFixed(1) + 's', p.inCar.x, p.inCar.y - 44);
      ctx.restore();
      ctx.textAlign = 'left';
    }
  }
}

function drawPickups(game, ctx) {
  for (const p of game.pickups) {
    const bob = Math.sin(game.t * 4 + p.x) * 4;
    if (p.kind === 'package') {
      ctx.fillStyle = '#b3922c';
      ctx.fillRect(p.x - 10, p.y - 10 + bob, 20, 20);
      ctx.strokeStyle = '#7a5e14';
      ctx.strokeRect(p.x - 10, p.y - 10 + bob, 20, 20);
    } else if (p.kind === 'ammo') {
      ctx.fillStyle = '#4f8ac9';
      ctx.fillRect(p.x - 9, p.y - 6 + bob, 18, 12);
      ctx.fillStyle = '#ffd166';
      ctx.fillRect(p.x - 6, p.y - 10 + bob, 4, 6);
      ctx.fillRect(p.x + 2, p.y - 10 + bob, 4, 6);
    } else if (p.kind === 'health') {
      ctx.fillStyle = '#ff5d7d';
      ctx.fillRect(p.x - 10, p.y - 4 + bob, 20, 8);
      ctx.fillRect(p.x - 4, p.y - 10 + bob, 8, 20);
    } else if (p.kind === 'armor') {
      ctx.fillStyle = '#8ac9ff';
      ctx.beginPath();
      ctx.moveTo(p.x, p.y - 12 + bob); ctx.lineTo(p.x + 10, p.y - 6 + bob);
      ctx.lineTo(p.x + 10, p.y + 4 + bob); ctx.lineTo(p.x, p.y + 12 + bob);
      ctx.lineTo(p.x - 10, p.y + 4 + bob); ctx.lineTo(p.x - 10, p.y - 6 + bob);
      ctx.closePath(); ctx.fill();
    } else if (p.kind === 'hidden') {
      // hidden package: spinning green briefcase glow
      const spin = game.t * 2.4 + p.x;
      ctx.save();
      ctx.translate(p.x, p.y + bob);
      ctx.rotate(Math.sin(spin) * 0.5);
      ctx.fillStyle = '#8cff5d';
      ctx.shadowColor = '#8cff5d'; ctx.shadowBlur = 12;
      ctx.fillRect(-9, -6, 18, 12);
      ctx.fillStyle = '#5a9a3a';
      ctx.fillRect(-2, -8, 4, 4);
      ctx.restore();
      ctx.fillStyle = 'rgba(140,255,93,0.10)';
      ctx.beginPath(); ctx.arc(p.x, p.y, 20, 0, TAU); ctx.fill();
    }
    ctx.fillStyle = 'rgba(255,255,255,0.10)';
    ctx.beginPath(); ctx.arc(p.x, p.y, 16, 0, TAU); ctx.fill();
  }
}

function drawPeds(game, ctx) {
  for (const p of game.peds) {
    if (p.x < game.vis.x0 - 40 || p.x > game.vis.x1 + 40 || p.y < game.vis.y0 - 40 || p.y > game.vis.y1 + 40) continue;
    const down = p.state === 'down' || p.state === 'dead';
    ctx.save();
    ctx.translate(p.x, p.y);
    if (down) {
      ctx.rotate(p.id * 0.7);
      ctx.globalAlpha = p.state === 'dead' ? Math.max(0, 1 - p.deadT / 8) : 1;
    }
    // shadow
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.beginPath(); ctx.ellipse(3, 4, 8, 4, 0, 0, TAU); ctx.fill();
    // body
    const bob = down ? 0 : Math.sin(p.wave) * 1.4;
    ctx.fillStyle = p.pants;
    ctx.fillRect(-5, -2 + bob * 0.3, 10, 8);
    ctx.fillStyle = p.shirt;
    ctx.fillRect(-6, -8 + bob * 0.5, 12, 8);
    // head
    ctx.fillStyle = p.skin;
    ctx.beginPath(); ctx.arc(0, -12 + bob * 0.5, 4.4, 0, TAU); ctx.fill();
    if (p.kind === 'cop') {
      ctx.fillStyle = '#1a2440';
      ctx.beginPath(); ctx.arc(0, -13 + bob * 0.5, 4.6, Math.PI, 0); ctx.fill();
      ctx.fillStyle = '#ffd166';
      ctx.fillRect(-1.5, -17 + bob * 0.5, 3, 2);
    }
    // gun for cops
    if (p.kind === 'cop' && !down) {
      ctx.strokeStyle = '#111';
      ctx.lineWidth = 2.4;
      const gd = p.shootT !== undefined && p.shootT < 0.2 ? p.dir : p.dir;
      ctx.beginPath(); ctx.moveTo(0, -4); ctx.lineTo(Math.cos(gd) * 9, -4 + Math.sin(gd) * 9); ctx.stroke();
    }
    // raised arms while panicking
    if (!down && p.state === 'flee' && p.kind === 'ped') {
      ctx.fillStyle = p.skin;
      const armUp = Math.sin(game.t * 12 + p.id) * 2;
      ctx.fillRect(-8, -16 - armUp * 0.4, 3, 8);
      ctx.fillRect(5, -16 + armUp * 0.4, 3, 8);
    }
    // rain umbrella for walkers
    if (!down && p.kind === 'ped' && game.weather && game.weather.intensity > 0.4 && p.job !== 'jogger') {
      ctx.fillStyle = p.job === 'tourist' ? '#ffec8c' : '#2c3550';
      ctx.beginPath(); ctx.arc(0, -6, 10, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.beginPath(); ctx.arc(-2, -8, 4, 0, TAU); ctx.fill();
    }
    // dog on a leash for dog walkers
    if (!down && p.job === 'dogwalker') {
      const dx = Math.cos(p.dogPhase ?? 0) * 13, dy = Math.sin(p.dogPhase ?? 0) * 9;
      ctx.strokeStyle = 'rgba(220,220,230,0.5)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(2, 2); ctx.lineTo(dx, dy); ctx.stroke();
      ctx.fillStyle = '#8a6a4a';
      ctx.beginPath(); ctx.arc(dx, dy, 3.4, 0, TAU); ctx.fill();
      ctx.fillRect(dx + 2, dy - 1, 3, 2);
    }
    ctx.restore();
  }
}

function drawSkidmarks(game, ctx) {
  ctx.strokeStyle = 'rgba(10,10,14,0.5)';
  ctx.lineWidth = 3;
  for (const s of game.skids) {
    ctx.beginPath();
    ctx.moveTo(s.x0, s.y0);
    ctx.lineTo(s.x1, s.y1);
    ctx.stroke();
  }
}

function drawCars(game, ctx) {
  for (const c of game.cars) {
    if (c.x < game.vis.x0 - 160 || c.x > game.vis.x1 + 160 || c.y < game.vis.y0 - 160 || c.y > game.vis.y1 + 160) continue;
    drawCar(game, ctx, c);
  }
}

function drawCar(game, ctx, c) {
  const def = c.def;
  ctx.save();
  ctx.translate(c.x, c.y);
  // shadow
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.save();
  ctx.rotate(c.h);
  ctx.fillRect(-c.len / 2 + 4, -c.wid / 2 + 5, c.len, c.wid);
  ctx.restore();
  ctx.rotate(c.h);

  const wreck = c.state === 'wreck';
  // body
  ctx.fillStyle = wreck ? '#16161a' : c.color;
  roundRect(ctx, -c.len / 2, -c.wid / 2, c.len, c.wid, 7);
  ctx.fill();
  // outline
  ctx.strokeStyle = wreck ? '#0a0a0c' : 'rgba(0,0,0,0.55)';
  ctx.lineWidth = 2;
  roundRect(ctx, -c.len / 2, -c.wid / 2, c.len, c.wid, 7);
  ctx.stroke();

  if (!wreck) {
    // windshield + roof
    const roofLen = c.type === 'bus' || c.type === 'truck' ? c.len * 0.42 : c.len * 0.46;
    ctx.fillStyle = 'rgba(140,190,230,0.5)';
    ctx.fillRect(c.len * 0.08, -c.wid / 2 + 5, roofLen * 0.4, c.wid - 10);
    ctx.fillStyle = shadeCar(c.color, 0.82);
    ctx.fillRect(-c.len / 2 + roofLen * 0.5, -c.wid / 2 + 4, roofLen, c.wid - 8);
    // stripe for taxi
    if (c.type === 'taxi') {
      ctx.fillStyle = '#111';
      ctx.fillRect(-c.len * 0.1, -c.wid / 2, 8, c.wid);
      ctx.fillRect(c.len * 0.14, -c.wid / 2, 8, c.wid);
      ctx.fillStyle = '#ffd166';
      ctx.fillRect(-4, -c.wid / 2 - 2, 8, 4);
    }
    // type-specific roof furniture
    if (c.blinkT > 0) {
      // turn signal blinkers while an AI car is turning
      const on = Math.floor(game.t * 4) % 2 === 0;
      if (on) {
        ctx.fillStyle = 'rgba(255,160,60,0.95)';
        ctx.fillRect(c.len / 2 - 4, -c.wid / 2 - 1, 5, 4);
        ctx.fillRect(c.len / 2 - 4, c.wid / 2 - 3, 5, 4);
      }
    }
    if (c.type === 'van') {
      ctx.strokeStyle = '#3a3a46';
      ctx.lineWidth = 2;
      ctx.strokeRect(-c.len * 0.18, -c.wid / 2 + 3, c.len * 0.24, 3);
      ctx.strokeRect(-c.len * 0.18, c.wid / 2 - 6, c.len * 0.24, 3);
    }
    if (c.type === 'bus') {
      ctx.fillStyle = '#ffd166';
      ctx.font = 'bold 9px "Segoe UI", sans-serif';
      ctx.textAlign = 'center';
      ctx.save();
      ctx.rotate(Math.PI / 2);
      ctx.fillText('VICE', 0, -c.wid / 2 + 14);
      ctx.restore();
      ctx.textAlign = 'left';
    }
    if (c.type === 'taxi') {
      ctx.fillStyle = '#111';
      ctx.beginPath(); ctx.arc(-c.len * 0.1, 0, 3.4, 0, TAU); ctx.fill();
      ctx.fillStyle = '#e8b400';
      ctx.fillRect(-c.len * 0.12, -3, 7, 6);
    }
    if (c.type === 'pickup') {
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(-c.len / 2 + 8, -c.wid / 2 + 5, c.len * 0.36, c.wid - 10);
    }
    // police lightbar
    if (c.type === 'police') {      const on = c.siren && Math.floor(game.t * 6) % 2 === 0;
      ctx.fillStyle = on ? '#ff3050' : '#5a1020';
      ctx.fillRect(-6, -c.wid / 2 - 2, 7, 4);
      ctx.fillStyle = !on ? '#3050ff' : '#10205a';
      ctx.fillRect(1, -c.wid / 2 - 2, 7, 4);
      ctx.fillStyle = '#d8dce4';
      ctx.fillRect(-c.len / 2 + 6, -c.wid / 2 + 2, c.len - 12, 4);
      ctx.fillRect(-c.len / 2 + 6, c.wid / 2 - 6, c.len - 12, 4);
    }
    // brake lights
    if (c.brakeLight > 0.05) {
      ctx.fillStyle = 'rgba(255,70,70,0.9)';
      ctx.fillRect(-c.len / 2 - 2, -c.wid / 2 + 4, 4, 7);
      ctx.fillRect(-c.len / 2 - 2, c.wid / 2 - 11, 4, 7);
    }
    // nitro exhaust flame
    if (c.nitroGlow > 0.05) {
      ctx.fillStyle = 'rgba(120,200,255,' + (0.5 + Math.random() * 0.4) + ')';
      ctx.beginPath();
      ctx.moveTo(-c.len / 2, -4);
      ctx.lineTo(-c.len / 2 - 14 - Math.random() * 8, 0);
      ctx.lineTo(-c.len / 2, 4);
      ctx.closePath(); ctx.fill();
    }
    // reverse light
    if (c.speedFwd < -5) {
      ctx.fillStyle = 'rgba(255,255,240,0.85)';
      ctx.fillRect(-c.len / 2 - 2, -4, 4, 8);
    }
    // marker chevron above mission cars
    if (c.marker && c.marker !== null) {
      ctx.rotate(-c.h);
      const col = c.marker === 'gang' ? '#ff4a4a' : '#ffd166';
      const bob = Math.sin(game.t * 5) * 3;
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.moveTo(0, -c.wid / 2 - 22 + bob);
      ctx.lineTo(-7, -c.wid / 2 - 32 + bob);
      ctx.lineTo(7, -c.wid / 2 - 32 + bob);
      ctx.closePath(); ctx.fill();
      ctx.rotate(c.h);
    }
  } else {
    // wreck: charred + flames flicker handled by particles; draw glow
    ctx.fillStyle = 'rgba(255,120,40,' + (0.25 + Math.sin(game.t * 9 + c.id) * 0.1) + ')';
    ctx.beginPath(); ctx.arc(0, 0, c.len * 0.3, 0, TAU); ctx.fill();
  }
  ctx.restore();
}

function shadeCar(hex, k) {
  if (!hex || hex[0] !== '#') return hex;
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, ((n >> 16) & 255) * k) | 0;
  const g = Math.min(255, ((n >> 8) & 255) * k) | 0;
  const b = Math.min(255, (n & 255) * k) | 0;
  return `rgb(${r},${g},${b})`;
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

function drawPlayer(game, ctx) {
  const p = game.player;
  if (p.inCar) return;
  if (!p.alive) return;
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.beginPath(); ctx.ellipse(3, 4, 9, 4, 0, 0, TAU); ctx.fill();
  ctx.rotate(p.h + Math.PI / 2);
  // legs
  const bob = p.moving ? Math.sin(p.walkPhase) : 0;
  ctx.fillStyle = p.pants;
  ctx.fillRect(-4, -1 + bob, 3, 7);
  ctx.fillRect(1, -1 - bob, 3, 7);
  // torso
  ctx.fillStyle = p.shirt;
  ctx.fillRect(-5, -9, 10, 9);
  // arms + gun
  ctx.fillStyle = p.skin;
  ctx.fillRect(3, -9 + bob * 0.4, 3, 6);
  ctx.fillRect(-6, -9 - bob * 0.4, 3, 6);
  if (p.ammo > 0 || p.muzzleT > 0) {
    ctx.fillStyle = '#15151a';
    ctx.fillRect(4, -14, 3, 7);
  }
  // head
  ctx.beginPath(); ctx.arc(0, -13, 4.6, 0, TAU); ctx.fill();
  ctx.fillStyle = '#2a2a34';
  ctx.beginPath(); ctx.arc(0, -14, 4.8, Math.PI, 0); ctx.fill();
  // muzzle flash
  if (p.muzzleT > 0) {
    ctx.fillStyle = 'rgba(255,220,120,0.9)';
    ctx.beginPath();
    ctx.moveTo(5, -16); ctx.lineTo(12, -19); ctx.lineTo(8, -11); ctx.closePath(); ctx.fill();
  }
  // punch flash
  if (p.punchT > 0.16) {
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.beginPath(); ctx.arc(9, -10, 4, 0, TAU); ctx.fill();
  }
  // carried briefcase (heist)
  if (p.carryCase) {
    ctx.fillStyle = '#8a5a2c';
    ctx.fillRect(6, -4, 9, 7);
  }
  ctx.restore();
  // hurt flash
  if (p.hurtT > 0) {
    ctx.strokeStyle = 'rgba(255,80,80,0.7)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(p.x, p.y, 13, 0, TAU); ctx.stroke();
  }
}

function drawBullets(game, ctx) {
  for (const b of game.bullets) {
    ctx.strokeStyle = b.from === 'player' ? 'rgba(255,230,150,0.9)' : 'rgba(255,150,120,0.9)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(b.x, b.y);
    ctx.lineTo(b.x - Math.cos(b.a) * 12, b.y - Math.sin(b.a) * 12);
    ctx.stroke();
  }
}

function drawParticles(game, ctx) {
  for (const p of game.particles) {
    const a = clamp(p.life / p.life0, 0, 1);
    ctx.globalAlpha = a;
    if (p.kind === 'smoke') {
      ctx.fillStyle = p.color || 'rgba(60,60,66,0.55)';
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (1.6 - a * 0.6), 0, TAU); ctx.fill();
    } else if (p.kind === 'fire') {
      ctx.fillStyle = p.life > p.life0 * 0.5 ? 'rgba(255,160,60,0.9)' : 'rgba(255,80,40,0.7)';
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size * a, 0, TAU); ctx.fill();
    } else if (p.kind === 'spark') {
      ctx.strokeStyle = 'rgba(255,210,120,0.9)';
      ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * 0.03, p.y - p.vy * 0.03); ctx.stroke();
    } else if (p.kind === 'debris') {
      ctx.fillStyle = '#3a3a44';
      ctx.fillRect(p.x - 2, p.y - 2, 4, 4);
    } else if (p.kind === 'leaf') {
      ctx.fillStyle = '#3f9a4f';
      ctx.beginPath(); ctx.ellipse(p.x, p.y, 4, 2, p.vx, 0, TAU); ctx.fill();
    } else if (p.kind === 'splash') {
      ctx.fillStyle = 'rgba(160,210,255,0.7)';
      ctx.beginPath(); ctx.arc(p.x, p.y, 2.4, 0, TAU); ctx.fill();
    } else if (p.kind === 'flash') {
      const g = ctx.createRadialGradient(p.x, p.y, 2, p.x, p.y, p.size);
      g.addColorStop(0, 'rgba(255,240,200,' + 0.8 * a + ')');
      g.addColorStop(1, 'rgba(255,180,80,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
}

// ---------------------------------------------------------------- glow passes
function drawHeadlights(game, ctx) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const c of game.cars) {
    if (c.state === 'wreck') continue;
    if (c.x < game.vis.x0 - 200 || c.x > game.vis.x1 + 200 || c.y < game.vis.y0 - 200 || c.y > game.vis.y1 + 200) continue;
    if (c.driver === null && c.speed < 5 && c.type !== 'police') continue;
    const L = 170;
    const g = ctx.createRadialGradient(c.x + Math.cos(c.h) * c.len / 2, c.y + Math.sin(c.h) * c.len / 2, 6, c.x + Math.cos(c.h) * (c.len / 2 + L / 2), c.y + Math.sin(c.h) * (c.len / 2 + L / 2), L / 1.4);
    g.addColorStop(0, 'rgba(255,240,190,0.22)');
    g.addColorStop(1, 'rgba(255,240,190,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    const ax = c.x + Math.cos(c.h) * c.len / 2, ay = c.y + Math.sin(c.h) * c.len / 2;
    const spread = 0.42;
    ctx.moveTo(ax, ay);
    ctx.lineTo(ax + Math.cos(c.h - spread) * L, ay + Math.sin(c.h - spread) * L);
    ctx.lineTo(ax + Math.cos(c.h + spread) * L, ay + Math.sin(c.h + spread) * L);
    ctx.closePath();
    ctx.fill();
    // police red/blue sweep
    if (c.type === 'police' && c.siren) {
      const on = Math.floor(game.t * 6) % 2 === 0;
      const col = on ? 'rgba(255,60,80,0.35)' : 'rgba(70,110,255,0.35)';
      const g2 = ctx.createRadialGradient(c.x, c.y, 4, c.x, c.y, 90);
      g2.addColorStop(0, col);
      g2.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g2;
      ctx.beginPath(); ctx.arc(c.x, c.y, 90, 0, TAU); ctx.fill();
    }
  }
  ctx.restore();
}

function drawNeonGlow(game, ctx, vis) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const s of game.world.neonSigns) {
    if (s.x < vis.x0 - 150 || s.x > vis.x1 + 150 || s.y < vis.y0 - 150 || s.y > vis.y1 + 150) continue;
    if (Math.sin(game.t * 17 + s.x) <= -0.85) continue;
    const g = ctx.createRadialGradient(s.x, s.y, 4, s.x, s.y, 90);
    g.addColorStop(0, s.color + '44');
    g.addColorStop(1, s.color + '00');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(s.x, s.y, 90, 0, TAU); ctx.fill();
  }
  ctx.restore();
}

function drawWetSheen(game, ctx, vis) {
  // subtle diagonal light bands across roads (fresh rain look)
  ctx.save();
  ctx.globalAlpha = 0.05;
  ctx.fillStyle = '#9ecbff';
  const t = game.t * 30;
  for (let x = -t % 260; x < vis.x1; x += 260) {
    ctx.beginPath();
    ctx.moveTo(x, vis.y0);
    ctx.lineTo(x + 70, vis.y0);
    ctx.lineTo(x + 70 + (vis.y1 - vis.y0) * 0.4, vis.y1);
    ctx.lineTo(x + (vis.y1 - vis.y0) * 0.4, vis.y1);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
  // heavy rain: rippling puddles pooled along road centers
  if (game.weather && game.weather.intensity > 0.35) {
    ctx.save();
    ctx.strokeStyle = 'rgba(170,200,240,' + (game.weather.intensity * 0.22) + ')';
    ctx.lineWidth = 1.2;
    const ph = game.t * 2.4;
    for (const y of game.world.roadH) {
      if (y < vis.y0 - 40 || y > vis.y1 + 40) continue;
      for (let x = Math.floor(vis.x0 / 90) * 90; x < vis.x1; x += 90) {
        const wob = Math.sin(ph + x * 0.02 + y * 0.05);
        ctx.beginPath();
        ctx.ellipse(x + 40, y + wob * 3, 12 + wob * 3, 5, 0, 0, TAU);
        ctx.stroke();
      }
    }
    ctx.restore();
  }
  // neon reflections smeared on road below signs
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = 0.12;
  for (const s of game.world.neonSigns) {
    if (s.x < vis.x0 - 200 || s.x > vis.x1 + 200) continue;
    const roadY = Math.round(s.y / CFG.ROAD_SPACING) * CFG.ROAD_SPACING;
    if (Math.abs(roadY - s.y) > 200) continue;
    ctx.fillStyle = s.color;
    ctx.fillRect(s.x - 8, roadY - 26, 16, 52);
  }
  ctx.restore();
}

function drawExplosionFlash(game, ctx) {
  if (game.flash > 0.01) {
    ctx.fillStyle = 'rgba(255,240,210,' + Math.min(0.65, game.flash * 0.65) + ')';
    ctx.fillRect(0, 0, CFG.VIEW_W, CFG.VIEW_H);
  }
}

function drawNightVignette(ctx) {
  const g = ctx.createRadialGradient(CFG.VIEW_W / 2, CFG.VIEW_H / 2, CFG.VIEW_H * 0.42, CFG.VIEW_W / 2, CFG.VIEW_H / 2, CFG.VIEW_H * 0.85);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(4,4,12,0.55)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, CFG.VIEW_W, CFG.VIEW_H);
}

// ---------------------------------------------------------------- helicopter
function drawHeli(game, ctx) {
  const heli = game.police.heli;
  if (!heli) return;
  const { x, y } = heli;
  const off = 210; // shadow/searchlight offset below the air unit
  // searchlight pool on the ground
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const g = ctx.createRadialGradient(x, y + off, 6, x, y + off, heli.spotR + 30);
  g.addColorStop(0, 'rgba(255,250,220,0.5)');
  g.addColorStop(1, 'rgba(255,250,220,0)');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(x, y + off, heli.spotR + 30, 0, TAU); ctx.fill();
  ctx.restore();
  // shadow
  ctx.fillStyle = 'rgba(0,0,0,0.30)';
  ctx.beginPath(); ctx.ellipse(x - 40, y + off + 14, 26, 9, 0, 0, TAU); ctx.fill();
  // body
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = '#20242e';
  roundRect(ctx, -22, -9, 44, 18, 8); ctx.fill();
  ctx.fillStyle = '#8ac9ff';
  ctx.beginPath(); ctx.ellipse(12, 0, 8, 6, 0, 0, TAU); ctx.fill();
  // tail
  ctx.fillStyle = '#20242e';
  ctx.fillRect(-40, -3, 20, 6);
  // rotor blur
  ctx.strokeStyle = 'rgba(200,210,230,0.35)';
  ctx.lineWidth = 2;
  const ra = heli.rotor;
  ctx.beginPath();
  ctx.moveTo(Math.cos(ra) * 30, Math.sin(ra) * 30);
  ctx.lineTo(-Math.cos(ra) * 30, -Math.sin(ra) * 30);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(200,210,230,0.2)';
  ctx.beginPath();
  ctx.moveTo(Math.cos(ra + 1.6) * 30, Math.sin(ra + 1.6) * 30);
  ctx.lineTo(-Math.cos(ra + 1.6) * 30, -Math.sin(ra + 1.6) * 30);
  ctx.stroke();
  ctx.restore();
}

function drawShopPrompt(game, ctx) {
  let pr = game.shops && game.shops.prompt();
  if (!pr && game.transit) pr = game.transit.prompt();
  if (!pr) return;
  ctx.save();
  ctx.font = '600 13px "Segoe UI", sans-serif';
  ctx.textAlign = 'center';
  const tw = ctx.measureText(pr.text).width;
  ctx.fillStyle = 'rgba(6,6,12,0.8)';
  roundRect(ctx, pr.x - tw / 2 - 10, pr.y - 26, tw + 20, 22, 5);
  ctx.fill();
  ctx.fillStyle = pr.color;
  ctx.fillText(pr.text, pr.x, pr.y - 11);
  ctx.restore();
  ctx.textAlign = 'left';
}

function wrapText(ctx, text, x, y, maxW, lineH) {
  const words = text.split(' ');
  let line = '';
  let yy = y;
  for (const w of words) {
    const test = line ? line + ' ' + w : w;
    if (ctx.measureText(test).width > maxW && line) {
      ctx.fillText(line, x, yy);
      line = w;
      yy += lineH;
    } else line = test;
  }
  if (line) ctx.fillText(line, x, yy);
}

// ---------------------------------------------------------------- minimap
export function renderMinimap(game, ctx, cx, cy, r) {
  const w = game.world, p = game.player;
  const scale = r / 1500; // world units -> px
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, TAU);
  ctx.clip();
  ctx.fillStyle = '#0b0b14';
  ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  ctx.translate(cx, cy);
  const px = p.inCar ? p.inCar.x : p.x, py = p.inCar ? p.inCar.y : p.y;
  // ground zones
  ctx.fillStyle = '#131320';
  ctx.fillRect(-r, -r, r * 2, r * 2);
  ctx.fillStyle = '#0a1626';
  ctx.fillRect(-r, (CFG.OCEAN_S - py) * scale - r, r * 2, r * 2 + 400 * scale);
  ctx.fillRect(-r, (CFG.HARBOR_N - 900 - py) * scale - r, r * 2, 900 * scale);
  ctx.fillStyle = '#8a7a52';
  ctx.fillRect(-r, (CFG.SAND_S - py) * scale, r * 2, 160 * scale);
  ctx.fillStyle = '#17301c';
  ctx.fillRect((CFG.PARK.x0 - px) * scale, (CFG.PARK.y0 - py) * scale, (CFG.PARK.x1 - CFG.PARK.x0) * scale, (CFG.PARK.y1 - CFG.PARK.y0) * scale);
  // roads
  ctx.strokeStyle = '#3c3c52';
  ctx.lineWidth = Math.max(2, 40 * scale);
  for (const y of w.roadH) {
    if (Math.abs(y - py) > 1700) continue;
    ctx.beginPath();
    ctx.moveTo((0 - px) * scale, (y - py) * scale);
    ctx.lineTo((CFG.AIR_W - px) * scale, (y - py) * scale);
    ctx.stroke();
  }
  for (const x of w.roadV) {
    if (Math.abs(x - px) > 1700) continue;
    ctx.beginPath();
    ctx.moveTo((x - px) * scale, (CFG.DOCKS_S - py) * scale);
    ctx.lineTo((x - px) * scale, (CFG.SAND_S - py) * scale);
    ctx.stroke();
  }
  // airfield
  ctx.fillStyle = '#10101a';
  ctx.fillRect((CFG.AIR_W - px) * scale, (1300 - py) * scale, 700 * scale, 1200 * scale);
  // entities
  for (const c of game.cars) {
    if (Math.abs(c.x - px) > 1500 || Math.abs(c.y - py) > 1500) continue;
    if (c.type === 'police') ctx.fillStyle = c.ai ? '#4f8aff' : '#2a3a5a';
    else if (c.state === 'wreck') ctx.fillStyle = '#552222';
    else ctx.fillStyle = '#8a8f9a';
    ctx.fillRect((c.x - px) * scale - 1.5, (c.y - py) * scale - 1.5, 3, 3);
  }
  for (const ped of game.peds) {
    if (ped.state === 'dead' || ped.state === 'down') continue;
    if (Math.abs(ped.x - px) > 1500 || Math.abs(ped.y - py) > 1500) continue;
    ctx.fillStyle = ped.kind === 'cop' ? '#4f8aff' : '#5a6a5a';
    ctx.fillRect((ped.x - px) * scale - 1, (ped.y - py) * scale - 1, 2, 2);
  }
  // markers
  for (const m of game.missions.markers) {
    let dx = (m.x - px) * scale, dy = (m.y - py) * scale;
    const d = Math.hypot(dx, dy);
    const edge = r - 6;
    if (d > edge) { dx = (dx / d) * edge; dy = (dy / d) * edge; ctx.fillStyle = m.color; ctx.beginPath(); ctx.arc(dx, dy, 3, 0, TAU); ctx.fill(); continue; }
    ctx.fillStyle = m.color;
    ctx.beginPath();
    ctx.arc(dx, dy, 3.4, 0, TAU);
    ctx.fill();
  }
  // Palm Line bus + route hint
  if (game.transit && game.transit.bus && game.transit.bus.state !== 'wreck') {
    const bx = (game.transit.bus.x - px) * scale, by = (game.transit.bus.y - py) * scale;
    if (Math.hypot(bx, by) < r - 4) {
      ctx.fillStyle = '#ffd166';
      ctx.fillRect(bx - 2.4, by - 2.4, 4.8, 4.8);
      ctx.strokeStyle = 'rgba(255,209,102,0.55)';
      ctx.lineWidth = 1;
      ctx.strokeRect(bx - 3.4, by - 3.4, 6.8, 6.8);
    }
  }
  // pickups
  for (const pk of game.pickups) {
    ctx.fillStyle = pk.kind === 'ammo' ? '#4f8ac9' : pk.kind === 'health' ? '#ff5d7d' : '#8cff5d';
    ctx.fillRect((pk.x - px) * scale - 1.5, (pk.y - py) * scale - 1.5, 3, 3);
  }
  // player arrow (center, pointing)
  const h = p.inCar ? p.inCar.h : p.h;
  ctx.translate(0, 0);
  ctx.rotate(h + Math.PI / 2);
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(0, -6); ctx.lineTo(4.4, 5); ctx.lineTo(0, 2.6); ctx.lineTo(-4.4, 5);
  ctx.closePath(); ctx.fill();
  ctx.restore();
}

function game_time() { return window.__vpTime ?? 0; }
