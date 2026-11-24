// hud.js — health/armor/money/ammo/stars, speedometer, subtitles, toasts,
// mission line + timer, and the circular minimap.

import { CFG } from './config.js';
import { clamp, fmtMoney, fmtTime, TAU } from './util.js';
import { currentMarkers } from './missions.js';

export function drawHud(g, ctx) {
  const p = g.player;
  if (!p) return;

  // ---------- top-left: vitals + money
  panel(ctx, 14, 14, 190, p.armor > 0 ? 92 : 74);
  bar(ctx, 24, 24, 170, 14, clamp(p.hp / CFG.PLAYER_HP, 0, 1), '#67e08a', '#173322');
  ctx.fillStyle = '#cfd2da';
  ctx.font = 'bold 11px monospace';
  ctx.textAlign = 'left';
  ctx.fillText('HEALTH', 24, 21);
  if (p.armor > 0) {
    bar(ctx, 24, 46, 170, 12, clamp(p.armor / 100, 0, 1), '#5ab2ff', '#14243d');
    ctx.fillStyle = '#cfd2da';
    ctx.fillText('ARMOR', 24, 43);
  }
  const moneyY = p.armor > 0 ? 84 : 66;
  ctx.font = 'bold 21px monospace';
  ctx.fillStyle = '#8fe08f';
  ctx.fillText(fmtMoney(p.money), 24, moneyY);
  // ammo
  ctx.font = 'bold 14px monospace';
  ctx.fillStyle = '#e8d98a';
  ctx.fillText(`AMMO ${p.ammo}`, 150, moneyY);

  // ---------- top-right: wanted stars
  const stars = g.wanted;
  ctx.save();
  ctx.translate(CFG.VIEW_W - 30, 30);
  for (let i = 0; i < CFG.WANTED_MAX; i++) {
    const x = -i * 30;
    const on = i < stars;
    drawStar(ctx, x, 0, 11, on ? '#ffd24a' : 'rgba(255,255,255,0.16)', on);
    if (on) {
      ctx.shadowColor = '#ffd24a';
      ctx.shadowBlur = 10;
      drawStar(ctx, x, 0, 11, '#ffd24a', true);
      ctx.shadowBlur = 0;
    }
  }
  ctx.restore();

  // toasts under stars
  let ty = 62;
  for (const t of g.toasts) {
    ctx.font = 'bold 14px monospace';
    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(8,10,20,0.6)';
    const w = ctx.measureText(t.text).width + 18;
    ctx.fillRect(CFG.VIEW_W - 22 - w, ty - 14, w, 22);
    ctx.fillStyle = t.col;
    ctx.fillText(t.text, CFG.VIEW_W - 31, ty + 1);
    ty += 28;
  }
  ctx.textAlign = 'left';

  // ---------- mission line
  const M = g.missions;
  if (M && M.active) {
    const A = M.active;
    const st = A.def.steps[A.step];
    ctx.textAlign = 'center';
    ctx.font = 'bold 15px monospace';
    ctx.fillStyle = '#ffd24a';
    ctx.fillText(A.def.name.toUpperCase(), CFG.VIEW_W / 2, 30);
    ctx.font = '13px monospace';
    ctx.fillStyle = '#e6e8f0';
    if (st && st.text) ctx.fillText(st.text, CFG.VIEW_W / 2, 50);
    if (A.timer !== null) {
      const tt = Math.max(0, A.timer);
      ctx.font = 'bold 26px monospace';
      ctx.fillStyle = tt < 10 ? '#ff6a6a' : '#e8e8f0';
      ctx.fillText(fmtTime(tt), CFG.VIEW_W / 2, 80);
    }
    // escape countdown for the runner mission
    if (st && st.type === 'destroyRunner' && A.data.escapeT != null) {
      ctx.font = 'bold 22px monospace';
      ctx.fillStyle = A.data.escapeT < 15 ? '#ff6a6a' : '#e8e8f0';
      ctx.fillText(`ESCAPES IN ${Math.ceil(A.data.escapeT)}s`, CFG.VIEW_W / 2, 80);
    }
    ctx.textAlign = 'left';
  }

  // ---------- subtitles
  ctx.textAlign = 'center';
  let sy = CFG.VIEW_H - 64;
  for (let i = g.subs.length - 1; i >= 0 && i >= g.subs.length - 2; i--) {
    const s = g.subs[i];
    const a = clamp(s.t / 0.4, 0, 1);
    ctx.font = '15px monospace';
    const w = ctx.measureText(s.text).width + 26;
    ctx.fillStyle = `rgba(6,8,16,${0.72 * a})`;
    ctx.fillRect(CFG.VIEW_W / 2 - w / 2, sy - 18, w, 26);
    ctx.fillStyle = `rgba(240,240,246,${a})`;
    ctx.fillText(s.text, CFG.VIEW_W / 2, sy);
    sy -= 34;
  }
  ctx.textAlign = 'left';

  // ---------- speedometer
  if (p.car && !p.car.dead) {
    const c = p.car;
    const sp = Math.hypot(c.vx, c.vy) * 0.42; // "km/h"
    const cx = CFG.VIEW_W - 96, cy = CFG.VIEW_H - 96, r = 62;
    ctx.fillStyle = 'rgba(8,10,20,0.55)';
    ctx.beginPath();
    ctx.arc(cx, cy, r + 14, 0, TAU);
    ctx.fill();
    // arc gauge
    ctx.lineWidth = 7;
    ctx.strokeStyle = 'rgba(255,255,255,0.14)';
    ctx.beginPath();
    ctx.arc(cx, cy, r, Math.PI * 0.75, Math.PI * 2.25);
    ctx.stroke();
    const frac = clamp(sp / 170, 0, 1);
    ctx.strokeStyle = frac > 0.8 ? '#ff6a6a' : '#8fd0ff';
    ctx.beginPath();
    ctx.arc(cx, cy, r, Math.PI * 0.75, Math.PI * 0.75 + frac * Math.PI * 1.5);
    ctx.stroke();
    ctx.fillStyle = '#eef0f6';
    ctx.font = 'bold 20px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(Math.round(sp), cx, cy + 6);
    ctx.font = '10px monospace';
    ctx.fillStyle = '#9aa0b0';
    ctx.fillText('KM/H', cx, cy + 22);
    if (c.hp < CFG.SMOKE_HP) {
      ctx.fillStyle = c.burning > 0 ? '#ff6a3a' : '#ffb03a';
      ctx.font = 'bold 11px monospace';
      ctx.fillText(c.burning > 0 ? '! FIRE !' : 'DAMAGED', cx, cy - 24);
    }
    ctx.textAlign = 'left';
  }

  drawMinimap(g, ctx);
}

// ------------------------------------------------------------------ minimap

function drawMinimap(g, ctx) {
  const p = g.player;
  const mm = g.world.minimap;
  if (!mm || !p) return;
  const R = 96;
  const cx = 26 + R, cy = CFG.VIEW_H - 26 - R;
  const z = 0.34;                    // minimap zoom (screen px per world px)
  const ms = mm.scale;

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, TAU);
  ctx.clip();
  // backing
  ctx.fillStyle = '#10131c';
  ctx.fillRect(cx - R, cy - R, R * 2, R * 2);

  const srcW = (2 * R / z) * ms;
  const sx = p.x * ms - srcW / 2;
  const sy = p.y * ms - srcW / 2;
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(mm.canvas, sx, sy, srcW, srcW, cx - R, cy - R, R * 2, R * 2);

  const w2s = (wx, wy) => ({ x: cx + (wx - p.x) * z, y: cy + (wy - p.y) * z });

  // markers
  for (const m of g.markers) {
    const s = w2s(m.x, m.y);
    if (Math.hypot(s.x - cx, s.y - cy) > R - 6) continue;
    ctx.fillStyle = m.kind === 'target' ? m.col : m.col;
    ctx.beginPath();
    ctx.arc(s.x, s.y, 4, 0, TAU);
    ctx.fill();
  }
  // cops
  ctx.fillStyle = '#ff4040';
  for (const c of g.cars) {
    if (c.kind !== 'police' || c.dead) continue;
    const s = w2s(c.x, c.y);
    if (Math.hypot(s.x - cx, s.y - cy) > R - 5) continue;
    ctx.fillRect(s.x - 2.5, s.y - 2.5, 5, 5);
  }
  // mission cars (red dots handled via markers)
  // player arrow
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate((p.car ? p.car.ang : p.ang) + Math.PI / 2);
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(0, -7);
  ctx.lineTo(5, 5);
  ctx.lineTo(-5, 5);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  ctx.restore();

  // ring + N
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, TAU);
  ctx.stroke();
  ctx.fillStyle = '#cfd2da';
  ctx.font = 'bold 11px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('N', cx, cy - R + 14);
  ctx.textAlign = 'left';
}

// ------------------------------------------------------------------ widgets

function panel(ctx, x, y, w, h) {
  ctx.fillStyle = 'rgba(8,10,20,0.55)';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
}

function bar(ctx, x, y, w, h, frac, col, bg) {
  ctx.fillStyle = bg;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = col;
  ctx.fillRect(x, y, Math.max(0, w * frac), h);
  ctx.strokeStyle = 'rgba(0,0,0,0.5)';
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
}

function drawStar(ctx, x, y, r, col, fill) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const rr = i % 2 === 0 ? r : r * 0.45;
    const a = -Math.PI / 2 + (i / 10) * TAU;
    const px = x + Math.cos(a) * rr;
    const py = y + Math.sin(a) * rr;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  if (fill) {
    ctx.fillStyle = col;
    ctx.fill();
  } else {
    ctx.strokeStyle = col;
    ctx.lineWidth = 1.4;
    ctx.stroke();
  }
}
