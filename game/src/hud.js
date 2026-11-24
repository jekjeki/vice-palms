// VICE PALMS — HUD: health / armor / money / wanted stars / weapon + ammo /
// speedo / objective text / subtitles / toasts / circular minimap.

import { CFG } from './config.js';
import { G } from './state.js';
import { clamp, fmtMoney, fmtTime } from './util.js';
import { activeMarker } from './missions.js';
import { STORY } from './missions.js';

const FONT = 'monospace';

export function drawHUD(ctx) {
  if (G.screen === 'title' || G.screen === 'end') return;
  const p = G.player;

  // ---- top right cluster: money + stars ----------------------------------
  ctx.textAlign = 'right';
  ctx.font = 'bold 26px ' + FONT;
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fillText(fmtMoney(p.money), G.W - 30 + 2, 46 + 2);
  ctx.fillStyle = '#7dff9e';
  ctx.fillText(fmtMoney(p.money), G.W - 30, 46);

  // stars
  const pulse = G.starPulse;
  G.starPulse = Math.max(0, G.starPulse - 0.02);
  for (let i = 0; i < 5; i++) {
    const x = G.W - 42 - i * 30, y = 76;
    ctx.save();
    ctx.translate(x, y);
    ctx.globalAlpha = i < p.stars ? 1 : 0.16;
    if (i < p.stars && pulse > 0) { const s = 1 + pulse * 0.25; ctx.scale(s, s); }
    drawStar(ctx, 0, 0, 11, i < p.stars ? '#ffe36e' : '#8a8fa8');
    ctx.restore();
  }

  // ---- health / armor bars ----------------------------------------------
  bar(ctx, G.W - 210, 100, 180, 12, p.hp / CFG.P_HP, '#3aa14a', 'HP');
  if (p.armor > 0) bar(ctx, G.W - 210, 118, 180, 9, p.armor / CFG.P_ARMOR_MAX, '#5ad0ff', 'ARMOR');

  // weapon + ammo
  ctx.textAlign = 'right';
  ctx.font = 'bold 15px ' + FONT;
  ctx.fillStyle = '#dfe6ee';
  ctx.fillText(p.weapon === 'fist' ? 'FISTS' : ('PISTOL × ' + p.ammo), G.W - 30, 148);

  // ---- mission objective --------------------------------------------------
  const mid = G.mission || G.sideMission;
  if (mid) {
    ctx.textAlign = 'center';
    ctx.font = 'bold 17px ' + FONT;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillText(mid.hint || '', G.W / 2 + 1, 33);
    ctx.fillStyle = '#ffe36e';
    ctx.fillText(mid.hint || '', G.W / 2, 32);
    const t = mid.timerActive ? mid.timer : (mid.timer > 0 ? mid.timer : 0);
    if (mid.timerActive && t > 0) {
      ctx.font = 'bold 22px ' + FONT;
      ctx.fillStyle = t < 10 ? '#ff4f6e' : '#dfe6ee';
      ctx.fillText(fmtTime(t), G.W / 2, 60);
    }
  } else {
    const def = STORY[G.missionIdx];
    ctx.textAlign = 'center';
    ctx.font = 'bold 16px ' + FONT;
    ctx.fillStyle = 'rgba(255,231,110,0.75)';
    ctx.fillText(def ? 'FOLLOW THE YELLOW MARKER — ' + def.name : 'VICE PALMS — free roam', G.W / 2, 32);
  }

  // ---- speedo --------------------------------------------------------------
  if (p.car) {
    const spd = Math.hypot(p.car.vx, p.car.vy) * 0.42;   // fake mph
    ctx.textAlign = 'right';
    ctx.font = 'bold 30px ' + FONT;
    ctx.fillStyle = 'rgba(223,230,238,0.9)';
    ctx.fillText(Math.round(spd) + '', G.W - 66, G.H - 44);
    ctx.font = '13px ' + FONT;
    ctx.fillStyle = 'rgba(160,170,200,0.8)';
    ctx.fillText('MPH', G.W - 66, G.H - 28);
    // gear-ish bar
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.fillRect(G.W - 220, G.H - 52, 140, 8);
    ctx.fillStyle = spd > 260 ? '#ff4f6e' : '#3ae7ff';
    ctx.fillRect(G.W - 220, G.H - 52, 140 * clamp(spd / 340, 0, 1), 8);
  }

  // ---- busted progress -----------------------------------------------------
  if (G.bustT > 0.1) {
    ctx.textAlign = 'center';
    ctx.font = 'bold 18px ' + FONT;
    ctx.fillStyle = '#5ad0ff';
    ctx.fillText('GET AWAY FROM THE COPS!', G.W / 2, G.H - 90);
  }

  // ---- toasts ---------------------------------------------------------------
  let ty = G.H - 40;
  for (let i = G.toasts.length - 1; i >= 0; i--) {
    const t = G.toasts[i];
    const a = clamp(t.t / 0.4, 0, 1);
    ctx.globalAlpha = a;
    ctx.textAlign = 'left';
    ctx.font = '14px ' + FONT;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(24, ty - 18, ctx.measureText(t.msg).width + 20, 24);
    ctx.fillStyle = '#dfe6ee';
    ctx.fillText(t.msg, 34, ty);
    ctx.globalAlpha = 1;
    ty -= 30;
  }

  // ---- subtitles -------------------------------------------------------------
  if (G.subNow) {
    const s = G.subNow;
    const a = clamp(s.t / 0.5, 0, 1);
    ctx.globalAlpha = a;
    ctx.textAlign = 'center';
    ctx.font = '16px ' + FONT;
    const w = ctx.measureText(s.line).width;
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.fillRect(G.W / 2 - w / 2 - 14, G.H - 118, w + 28, 28);
    ctx.fillStyle = '#ffe9a8';
    ctx.fillText(s.line, G.W / 2, G.H - 98);
    ctx.globalAlpha = 1;
  }

  // ---- minimap ----------------------------------------------------------------
  drawMinimap(ctx);
}

function bar(ctx, x, y, w, h, f, col, label) {
  f = clamp(f, 0, 1);
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(x - 2, y - 2, w + 4, h + 4);
  ctx.fillStyle = '#20242c';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = col;
  ctx.fillRect(x, y, w * f, h);
  ctx.font = '10px ' + FONT;
  ctx.textAlign = 'left';
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.fillText(label, x + 3, y + h - 2);
}

function drawStar(ctx, cx, cy, r, col) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + i * Math.PI / 5;
    const rr = i % 2 === 0 ? r : r * 0.45;
    const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr;
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fillStyle = col;
  ctx.fill();
}

function drawMinimap(ctx) {
  const w = G.world;
  if (!w || !w.miniCanvas) return;
  const R = 86;
  const cx = 34 + R, cy = G.H - 34 - R;
  const p = G.player;
  const px = p.car ? p.car.x : p.x, py = p.car ? p.car.y : p.y;

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.clip();

  // base map: zoom so the city fits, centered on the player
  const scale = 0.24;                       // world px → minimap px
  const mx = cx - px * scale, my = cy - py * scale;
  ctx.fillStyle = '#0a0c1c';
  ctx.fillRect(cx - R, cy - R, R * 2, R * 2);
  ctx.save();
  ctx.translate(mx, my);
  ctx.scale(scale, scale);
  ctx.globalAlpha = 0.9;
  ctx.drawImage(w.staticCanvas, 0, 0, w.W, w.H);
  ctx.restore();

  // blips
  const blip = (x, y, col, r) => {
    const bx = cx + (x - px) * scale, by = cy + (y - py) * scale;
    if (Math.hypot(bx - cx, by - cy) > R - 6) return;
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.arc(bx, by, r || 3.4, 0, Math.PI * 2); ctx.fill();
  };
  for (const c of G.cars) {
    if (c.dead) continue;
    if (c.ai && c.ai.kind === 'cop') blip(c.x, c.y, Math.floor(G.time * 6) % 2 ? '#ff3040' : '#2040ff', 4);
  }
  for (const cop of G.cops) if (!cop.dead) blip(cop.x, cop.y, '#2040ff', 3);
  const mk = activeMarker();
  if (mk) blip(mk.x, mk.y, mk.col, 4.6);

  // player arrow
  const ang = p.car ? p.car.ang : p.ang;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(ang);
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(7, 0); ctx.lineTo(-5, -5); ctx.lineTo(-5, 5);
  ctx.closePath(); ctx.fill();
  ctx.restore();

  ctx.restore();

  // frame
  ctx.strokeStyle = 'rgba(255,231,110,0.55)';
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = 'rgba(0,0,0,0.6)';
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(cx, cy, R + 2.4, 0, Math.PI * 2); ctx.stroke();
}
