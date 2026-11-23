// hud.js — health/armor/money, wanted stars, weapon + ammo, speedometer,
// subtitles, toasts, mission objective bar, circular minimap.
import { S, VW, VH, clamp, moneyFmt } from './core.js';
import { drawMinimap } from './render.js';
import { hudLine } from './missions.js';
import { zoneAt } from './world.js';

let helpT = 22; // show control hints for the first half-minute

export function drawHud(ctx) {
  const p = S.player;
  if (!p) return;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.textAlign = 'left';

  // ---- top-left: health & armor bars
  const bx = 24, by = 24;
  bar(ctx, bx, by, 210, 16, p.hp / p.maxHp, '#3adf6a', 'HEALTH');
  if (p.armor > 0) bar(ctx, bx, by + 22, 210, 12, p.armor / p.maxArmor, '#5ab4ff', 'ARMOR');
  // money
  S.moneyShow += (S.money - S.moneyShow) * 0.15;
  ctx.font = 'bold 26px Arial Black, Arial';
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillText('$' + moneyFmt(Math.round(S.moneyShow)), bx + 2, by + 66 + 2);
  ctx.fillStyle = '#7be495';
  ctx.fillText('$' + moneyFmt(Math.round(S.moneyShow)), bx, by + 64);
  // sprint stamina pip
  const stF = S.player.stamina / 100;
  if (stF < 0.999) {
    ctx.fillStyle = 'rgba(6,6,14,0.7)';
    roundRect(ctx, bx, by + 76, 130, 8, 4); ctx.fill();
    ctx.fillStyle = stF < 0.2 ? '#ff7a5a' : '#ffe9a8';
    ctx.fillRect(bx + 2, by + 78, 126 * stF, 4);
  }

  // ---- top-right: wanted stars + weapon
  stars(ctx, VW - 30, 30);
  weapon(ctx, VW - 30, 78, p);

  // ---- mission bar
  const line = hudLine();
  if (line) {
    ctx.font = 'bold 15px Arial Black, Arial';
    const w = Math.max(ctx.measureText(line.name).width, ctx.measureText(line.obj).width) + 26;
    ctx.fillStyle = 'rgba(8,8,18,0.72)';
    roundRect(ctx, VW / 2 - w / 2, 14, w, 52, 9); ctx.fill();
    ctx.fillStyle = '#ffd23c';
    ctx.fillText(line.name.toUpperCase(), VW / 2 - w / 2 + 13, 36);
    ctx.fillStyle = '#f0f0f5';
    ctx.font = '13px Arial';
    ctx.fillText(line.obj, VW / 2 - w / 2 + 13, 57);
    if (line.t !== null) {
      const t = Math.max(0, line.t);
      ctx.font = 'bold 16px Arial Black, Arial';
      ctx.fillStyle = t < 10 ? '#ff5050' : '#7be495';
      ctx.textAlign = 'right';
      ctx.fillText(fmtT(t), VW / 2 + w / 2 - 13, 57);
      ctx.textAlign = 'left';
    }
  }

  // ---- speedometer (in car)
  if (p.inCar && !p.inCar.dead) {
    speedo(ctx, VW - 108, VH - 96, p.inCar);
  }

  // ---- minimap
  drawMinimap(ctx, 104, VH - 104, 88);

  // ---- toasts
  let ty = 92;
  for (const t of S.toasts) {
    const a = t.t < 0.25 ? t.t / 0.25 : t.t > t.dur - 0.5 ? Math.max(0, (t.dur - t.t) / 0.5) : 1;
    ctx.globalAlpha = a;
    ctx.font = 'bold 17px Arial Black, Arial';
    const w = ctx.measureText(t.text).width + 28;
    ctx.fillStyle = 'rgba(10,10,24,0.8)';
    roundRect(ctx, VW / 2 - w / 2, ty, w, 30, 7); ctx.fill();
    ctx.fillStyle = '#ffe9a8';
    ctx.textAlign = 'center';
    ctx.fillText(t.text, VW / 2, ty + 21);
    ctx.textAlign = 'left';
    ctx.globalAlpha = 1;
    ty += 38;
  }

  // ---- subtitles
  let sy = VH - 46;
  for (let i = S.subs.length - 1; i >= 0; i--) {
    const sub = S.subs[i];
    const a = sub.t < 0.3 ? sub.t / 0.3 : sub.t > sub.dur - 0.6 ? Math.max(0, (sub.dur - sub.t) / 0.6) : 1;
    ctx.globalAlpha = a;
    ctx.font = '15px Arial';
    const w = ctx.measureText(sub.text).width + 30;
    ctx.fillStyle = 'rgba(0,0,0,0.72)';
    roundRect(ctx, VW / 2 - w / 2, sy - 20, w, 26, 6); ctx.fill();
    ctx.fillStyle = '#f5f2ea';
    ctx.textAlign = 'center';
    ctx.fillText(sub.text, VW / 2, sy - 2);
    ctx.textAlign = 'left';
    ctx.globalAlpha = 1;
    sy -= 34;
  }

  // ---- mission banner (passed/failed)
  if (S.mission.banner) {
    const b = S.mission.banner;
    const a = clamp(S.mission.bannerT < 0.5 ? S.mission.bannerT / 0.5 : 1, 0, 1);
    ctx.globalAlpha = a;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, VH / 2 - 74, VW, 148);
    ctx.textAlign = 'center';
    ctx.font = 'bold 46px Arial Black, Arial';
    ctx.fillStyle = b.text.includes('FAILED') ? '#ff5060' : '#7be495';
    ctx.fillText(b.text, VW / 2, VH / 2 - 8);
    if (b.pay > 0) {
      ctx.font = 'bold 26px Arial Black, Arial';
      ctx.fillStyle = '#ffd23c';
      ctx.fillText('+$' + moneyFmt(b.pay), VW / 2, VH / 2 + 30);
    }
    ctx.font = '15px Arial';
    ctx.fillStyle = '#d8d5cc';
    ctx.fillText(b.name, VW / 2, VH / 2 + 56);
    ctx.textAlign = 'left';
    ctx.globalAlpha = 1;
  }

  // ---- first-minute control hints
  if (helpT > 0 && S.mode === 'playing') {
    helpT -= 1 / 60;
    ctx.globalAlpha = clamp(helpT / 3, 0, 0.85);
    ctx.font = '13px Arial';
    ctx.fillStyle = '#cfd4de';
    const hints = 'WASD move · SHIFT sprint · F carjack · LMB shoot · 1/2/3 weapons · SPACE handbrake · TAB map · ESC pause';
    const w = ctx.measureText(hints).width + 24;
    ctx.fillStyle = 'rgba(8,8,18,0.65)';
    roundRect(ctx, VW / 2 - w / 2, VH - 152, w, 24, 6); ctx.fill();
    ctx.textAlign = 'center';
    ctx.fillText(hints, VW / 2, VH - 136);
    ctx.textAlign = 'left';
    ctx.globalAlpha = 1;
  }

  // damage direction flash
  if (S.damage.t > 0) {
    ctx.fillStyle = `rgba(255,30,30,${S.damage.t * 0.25})`;
    ctx.fillRect(0, 0, VW, 5);
    ctx.fillRect(0, VH - 5, VW, 5);
  }
}

function bar(ctx, x, y, w, h, f, col, label) {
  f = clamp(f, 0, 1);
  ctx.fillStyle = 'rgba(6,6,14,0.7)';
  roundRect(ctx, x - 3, y - 3, w + 6, h + 6, 5); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = col;
  ctx.fillRect(x, y, w * f, h);
  if (f < 0.28 && label === 'HEALTH') {
    ctx.fillStyle = `rgba(255,60,60,${0.35 + Math.sin(S.time * 8) * 0.25})`;
    ctx.fillRect(x, y, w, h);
  }
  ctx.font = 'bold 10px Arial';
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.fillText(label, x + 5, y + h - 4);
}

function stars(ctx, xr, y) {
  const flashing = S.seenT > 3 && S.wanted > 0;
  for (let i = 0; i < 5; i++) {
    const x = xr - 34 - i * 36;
    const on = i < S.wanted;
    let a = on ? 1 : 0.16;
    if (on && flashing) a = Math.sin(S.time * 10) > 0 ? 1 : 0.35;
    drawStar(ctx, x, y, 13, on ? `rgba(255,215,60,${a})` : `rgba(200,200,220,${a})`);
  }
}

function drawStar(ctx, cx, cy, r, col) {
  ctx.fillStyle = col;
  ctx.beginPath();
  for (let k = 0; k < 10; k++) {
    const rr = k % 2 === 0 ? r : r * 0.45;
    const a = -Math.PI / 2 + (k / 10) * Math.PI * 2;
    const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr;
    if (k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
}

function weapon(ctx, xr, y, p) {
  ctx.textAlign = 'right';
  ctx.font = 'bold 15px Arial Black, Arial';
  ctx.fillStyle = 'rgba(8,8,18,0.7)';
  const label = p.weapon === 'fist' ? 'FISTS' : p.weapon === 'smg' ? `SMG ${p.smgAmmo}` : `PISTOL ${p.ammo}`;
  const w = ctx.measureText(label).width + 18;
  roundRect(ctx, xr - w, y, w, 26, 6); ctx.fill();
  ctx.fillStyle = p.weapon === 'fist' ? '#d8d5cc' : '#ffe9a8';
  ctx.fillText(label, xr - 9, y + 19);
  ctx.textAlign = 'left';
}

// GTA-style district name card when the player crosses into a new zone.
export function drawZoneCard(ctx) {
  if (S.zoneT <= 0 || !S.zone) return;
  const a = clamp(S.zoneT < 0.4 ? S.zoneT / 0.4 : S.zoneT > 2.6 ? (3.2 - S.zoneT) / 0.6 : 1, 0, 1);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = a;
  ctx.font = 'bold 34px Arial Black, Arial';
  ctx.textAlign = 'right';
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillText(S.zone, VW - 26 + 2, VH - 176 + 2);
  ctx.fillStyle = '#ffd9f6';
  ctx.fillText(S.zone, VW - 26, VH - 176);
  ctx.font = '13px Arial';
  ctx.fillStyle = '#9aa4b8';
  ctx.fillText('VICE PALMS', VW - 26, VH - 200);
  ctx.textAlign = 'left';
  ctx.globalAlpha = 1;
}

function speedo(ctx, cx, cy, car) {
  const mph = Math.round(Math.abs(car.fwd) * 0.5);
  ctx.fillStyle = 'rgba(6,6,14,0.72)';
  roundRect(ctx, cx - 66, cy - 40, 132, 84, 10); ctx.fill();
  // arc gauge
  ctx.strokeStyle = 'rgba(255,255,255,0.14)';
  ctx.lineWidth = 6;
  ctx.beginPath(); ctx.arc(cx, cy - 4, 30, Math.PI * 0.75, Math.PI * 2.25); ctx.stroke();
  const f = clamp(Math.abs(car.fwd) / car.spec.max, 0, 1);
  ctx.strokeStyle = f > 0.85 ? '#ff5050' : '#5ab4ff';
  ctx.beginPath(); ctx.arc(cx, cy - 4, 30, Math.PI * 0.75, Math.PI * 0.75 + Math.PI * 1.5 * f); ctx.stroke();
  ctx.textAlign = 'center';
  ctx.font = 'bold 26px Arial Black, Arial';
  ctx.fillStyle = '#f0f0f5';
  ctx.fillText(String(mph), cx, cy + 26);
  ctx.font = '10px Arial';
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.fillText('MPH', cx, cy + 38);
  ctx.textAlign = 'left';
}

function fmtT(t) {
  const m = Math.floor(t / 60), s = Math.floor(t % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function updateHud(dt) {
  for (const t of S.toasts) t.t += dt;
  S.toasts = S.toasts.filter((t) => t.t < t.dur);
  for (const s of S.subs) s.t += dt;
  S.subs = S.subs.filter((s) => s.t < s.dur);
  S.damage.t = Math.max(0, S.damage.t - dt);
  S.zoneT = Math.max(0, S.zoneT - dt);
}

export function resetHelp() { helpT = 22; }

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
