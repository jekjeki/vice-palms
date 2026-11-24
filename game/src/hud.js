// Vice Palms — HUD: bars, money, stars, subtitles, circular minimap
import { S } from './game.js';

const VW = 1280, VH = 720;

export function drawHUD(s, ctx) {
  if (!s.world) return;
  drawMoney(ctx, s);
  drawBars(ctx, s);
  drawStars(ctx, s);
  drawWeapon(ctx, s);
  drawObjective(ctx, s);
  drawMinimap(ctx, s);
  drawSubtitles(ctx, s);
  drawToast(ctx, s);
}

function drawMoney(ctx, s) {
  ctx.save();
  ctx.font = 'bold 30px "Courier New", monospace';
  ctx.textAlign = 'right';
  ctx.shadowColor = '#020403'; ctx.shadowBlur = 6;
  ctx.fillStyle = '#7cff8a';
  const m = s.money.toLocaleString('en-US').padStart(8, '0');
  ctx.fillText('$' + m, VW - 26, 46);
  ctx.restore();
}

function drawBars(ctx, s) {
  const p = s.player;
  ctx.save();
  ctx.translate(VW - 26, 62);
  bar(ctx, 200, p.hp / 100, '#57d977', '#1d5c30', 'HP');
  if (p.armor > 0) bar(ctx, 200, p.armor / 100, '#5aa7ff', '#1d3a5c', 'ARMOR', 40);
  if (p.sprint < 99) bar(ctx, 200, p.sprint / 100, '#e8d24b', '#5c541d', 'STAMINA', 80);
  ctx.restore();
}
function bar(ctx, w, f, c, bg, label, y) {
  const yy = y || 0;
  const frac = Math.max(0, Math.min(1, Number.isFinite(f) ? f : 0));
  ctx.fillStyle = 'rgba(8,10,14,0.72)';
  ctx.fillRect(-w, yy, w, 20);
  ctx.fillStyle = bg;
  ctx.fillRect(-w + 2, yy + 2, (w - 4) * frac, 16);
  ctx.fillStyle = c;
  ctx.fillRect(-w + 2, yy + 2, (w - 4) * frac, 6);
  ctx.font = 'bold 11px Arial'; ctx.textAlign = 'left';
  ctx.fillStyle = '#e8ecf2';
  ctx.fillText(label, -w + 6, yy + 15);
}

function drawStars(ctx, s) {
  if (s.wanted <= 0 && s.heat < 0.4) return;
  ctx.save();
  ctx.translate(VW - 26, 160);
  for (let i = 0; i < 5; i++) {
    const on = i < s.wanted;
    star(ctx, -30 - i * 34, 0, 13, on ? '#ffd23e' : 'rgba(255,255,255,0.16)');
    if (on) {
      const blink = s.wanted >= 3 && Math.floor(s.time * 4) % 2 === 0;
      if (blink) {
        ctx.save(); ctx.globalAlpha = 0.8;
        star(ctx, -30 - i * 34, 0, 13, '#fff');
        ctx.restore();
      }
    }
  }
  ctx.restore();
}
function star(ctx, x, y, r, c) {
  ctx.fillStyle = c;
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const rr = i % 2 ? r * 0.45 : r;
    const a = -Math.PI / 2 + (i / 10) * Math.PI * 2;
    const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath(); ctx.fill();
}

function drawWeapon(ctx, s) {
  const p = s.player;
  ctx.save();
  ctx.translate(VW - 26, 196);
  ctx.font = 'bold 16px Arial'; ctx.textAlign = 'right';
  ctx.fillStyle = 'rgba(232,236,242,0.9)';
  ctx.fillText(p.weapon === 'pistol' ? `PISTOL × ${p.ammo}` : 'FISTS', 0, 0);
  if (p.inCar) {
    ctx.font = '12px Arial'; ctx.fillStyle = 'rgba(232,236,242,0.65)';
    ctx.fillText(p.inCar.t.name.toUpperCase(), 0, 18);
  }
  ctx.restore();
}

function drawObjective(ctx, s) {
  if (!s.objective) return;
  ctx.save();
  ctx.font = 'bold 16px Arial'; ctx.textAlign = 'left';
  const txt = s.objective;
  const w = Math.min(560, ctx.measureText(txt).width + 24);
  ctx.fillStyle = 'rgba(8,10,14,0.62)';
  ctx.fillRect(20, 18, w, 30);
  ctx.fillStyle = '#ffd23e';
  ctx.shadowColor = '#000'; ctx.shadowBlur = 4;
  ctx.fillText(txt, 32, 39);
  // mission timer
  const M = s.missions;
  if (M && M.timer > 0 && !M.done) {
    ctx.fillStyle = M.timer < 10 ? '#ff5a5a' : '#e8ecf2';
    ctx.font = 'bold 22px "Courier New", monospace';
    ctx.fillText(M.timer.toFixed(1), 32, 76);
  }
  ctx.restore();
}

function drawMinimap(ctx, s) {
  const w = s.world, p = s.player;
  const cx = 112, cy = VH - 112, R = 92;
  const scale = 1 / w.mms;               // world → mm pixels
  const zoom = 2.1;                       // world px shown per minimap px on screen
  ctx.save();
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, 7); ctx.clip();
  ctx.fillStyle = '#0b0d12'; ctx.fillRect(cx - R, cy - R, R * 2, R * 2);
  const srcR = (R * zoom) * scale;        // source radius in mm px
  ctx.drawImage(
    w.mm,
    p.cx() * scale - srcR, p.cy() * scale - srcR, srcR * 2, srcR * 2,
    cx - R, cy - R, R * 2, R * 2
  );
  // blips
  const blip = (wx, wy, c, r = 5) => {
    const dx = (wx - p.cx()) * scale * zoom, dy = (wy - p.cy()) * scale * zoom;
    if (dx * dx + dy * dy > (R - 8) * (R - 8)) {
      // clamp to rim
      const d = Math.hypot(dx, dy) || 1;
      const k = (R - 8) / d;
      ctx.fillStyle = c;
      ctx.beginPath(); ctx.arc(cx + dx * k, cy + dy * k, r * 0.8, 0, 7); ctx.fill();
      return;
    }
    ctx.fillStyle = c;
    ctx.beginPath(); ctx.arc(cx + dx, cy + dy, r, 0, 7); ctx.fill();
  };
  const mk = s.missions && s.missions.marker();
  if (mk) blip(mk.x, mk.y, '#ffd23e', 6);
  for (const c of s.police.cops) if (!c.dead) blip(c.x, c.y, '#4b9dff', 4);
  for (const q of s.peds.list) if (!q.dead && q.gang) blip(q.x, q.y, '#3ad46a', 3);
  // player arrow
  ctx.save();
  ctx.translate(cx, cy); ctx.rotate(p.inCar ? p.inCar.a : p.a);
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.moveTo(8, 0); ctx.lineTo(-6, -5); ctx.lineTo(-6, 5);
  ctx.closePath(); ctx.fill();
  ctx.restore();
  ctx.restore();
  // ring
  ctx.strokeStyle = 'rgba(232,236,242,0.75)'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, 7); ctx.stroke();
}

function drawSubtitles(ctx, s) {
  if (!s.subtitles.length) return;
  ctx.save();
  ctx.textAlign = 'center';
  let y = VH - 84;
  for (const sub of s.subtitles.slice(-2)) {
    ctx.font = 'bold 17px Arial';
    ctx.shadowColor = '#000'; ctx.shadowBlur = 6;
    ctx.fillStyle = 'rgba(232,236,242,0.95)';
    ctx.globalAlpha = Math.min(1, sub.t);
    ctx.fillText(sub.text, VW / 2, y);
    y += 26;
  }
  ctx.restore();
}

function drawToast(ctx, s) {
  if (s.msgT <= 0 || !s.msg) return;
  ctx.save();
  ctx.globalAlpha = Math.min(1, s.msgT);
  ctx.font = 'bold 15px Arial'; ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(8,10,14,0.7)';
  const w = ctx.measureText(s.msg).width + 30;
  ctx.fillRect(VW / 2 - w / 2, VH - 130, w, 26);
  ctx.fillStyle = '#e8ecf2';
  ctx.fillText(s.msg, VW / 2, VH - 112);
  ctx.restore();
}
