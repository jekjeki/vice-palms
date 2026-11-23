// hud.js — health/armor/money/stars/subtitles/speedo, banners, toasts, timer + circular minimap
import { CFG } from './config.js';
import { fmtMoney, fmtTime, clamp, TAU, dist2 } from './util.js';
import { renderMinimap } from './render.js';

export class HUD {
  constructor() {
    this.subText = '';
    this.subT = 0;
    this.toasts = [];
    this.bannerTitle = '';
    this.bannerSub = '';
    this.bannerT = 0;
    this.flashT = 0;
    this.minimapR = 74;
    this.pulse = 0;
  }

  subtitle(text, dur = 3) { this.subText = text; this.subT = dur; }
  toast(text) {
    this.toasts.push({ text, t: 2.6 });
    if (this.toasts.length > 4) this.toasts.shift();
  }
  banner(title, sub = '') {
    this.bannerTitle = title;
    this.bannerSub = sub;
    this.bannerT = 3.4;
    this.flashT = 0.4;
  }

  update(game, dt, ctx) {
    this.subT = Math.max(0, this.subT - dt);
    this.bannerT = Math.max(0, this.bannerT - dt);
    this.flashT = Math.max(0, this.flashT - dt);
    this.pulse += dt;
    for (const t of this.toasts) t.t -= dt;
    this.toasts = this.toasts.filter((t) => t.t > 0);
    this.draw(game, ctx);
  }

  draw(game, ctx) {
    const p = game.player;
    const m = game.missions.active;
    const W = CFG.VIEW_W, H = CFG.VIEW_H;

    // ---- health & armor (top-left) ----
    const barW = 190;
    ctx.fillStyle = 'rgba(6,6,12,0.72)';
    roundBox(ctx, 18, 16, barW + 46, 64, 8);
    // health
    const hpk = clamp(p.hp / CFG.P_HP, 0, 1);
    ctx.fillStyle = hpk < 0.3 ? '#ff4a5d' : '#8cff5d';
    ctx.fillRect(30, 30, barW * hpk, 14);
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.strokeRect(30, 30, barW, 14);
    ctx.fillStyle = '#dfe4ea';
    ctx.font = 'bold 12px "Segoe UI", sans-serif';
    ctx.fillText('HP', 30 + barW + 8, 41);
    // armor
    const ark = clamp(p.armor / CFG.P_ARMOR_MAX, 0, 1);
    ctx.fillStyle = '#8ac9ff';
    ctx.fillRect(30, 52, barW * ark, 14);
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.strokeRect(30, 52, barW, 14);
    ctx.fillStyle = '#dfe4ea';
    ctx.fillText('AR', 30 + barW + 8, 63);
    // ammo
    ctx.fillStyle = '#ffd166';
    ctx.font = 'bold 15px "Segoe UI", sans-serif';
    ctx.fillText(p.ammo + ' rds', 20, 100);

    // ---- money + stars (top-right) ----
    ctx.textAlign = 'right';
    ctx.font = 'bold 24px "Segoe UI", sans-serif';
    ctx.shadowColor = '#000'; ctx.shadowBlur = 6;
    ctx.fillStyle = '#8cff5d';
    ctx.fillText(fmtMoney(p.money), W - 24, 44);
    ctx.shadowBlur = 0;
    // stars
    for (let i = 0; i < CFG.WANTED_MAX; i++) {
      const on = i < game.police.wanted;
      const x = W - 30 - i * 26;
      drawStar(ctx, x, 66, 10, on ? (Math.sin(game.t * 6 + i) > 0 ? '#ffd166' : '#ff9d3c') : 'rgba(255,255,255,0.14)');
    }
    ctx.textAlign = 'left';

    // ---- radio readout (in car, top-right under stars) ----
    if (p.inCar && game.radio && game.radio.station) {
      ctx.textAlign = 'right';
      ctx.font = '700 12px "Segoe UI", sans-serif';
      ctx.fillStyle = game.radio.station.color;
      ctx.fillText(game.radio.station.name + '  ·  ' + game.radio.track, W - 24, 92);
      ctx.font = '600 10px "Segoe UI", sans-serif';
      ctx.fillStyle = 'rgba(200,200,215,0.55)';
      ctx.fillText('R: next station', W - 24, 106);
      ctx.textAlign = 'left';
    }

    // ---- objective hint under the mission name ----
    if (m && m.def.brief) {
      ctx.textAlign = 'center';
      ctx.font = '600 12px "Segoe UI", sans-serif';
      ctx.fillStyle = 'rgba(230,230,240,0.75)';
      ctx.fillText(m.def.brief, W / 2, 82);
      ctx.textAlign = 'left';
    }

    // ---- hidden package proximity ping ----
    if (game.pickups && !this.pingT) this.pingT = 0;
    this.pingT -= 0.016;
    for (const pk of game.pickups) {
      if (pk.kind !== 'hidden') continue;
      const d = dist2(p.x, p.y, pk.x, pk.y);
      if (d < 220 * 220) {
        ctx.textAlign = 'center';
        ctx.font = '700 11px "Segoe UI", sans-serif';
        ctx.fillStyle = '#8cff5d';
        ctx.fillText('PACKAGE NEARBY', W / 2, 108);
        ctx.textAlign = 'left';
        break;
      }
    }

    // ---- mission timer (top-center) ----
    if (m && m.timer !== null && m.timer !== undefined) {
      const urgent = m.timer < 12;
      ctx.textAlign = 'center';
      ctx.font = 'bold 30px "Segoe UI", sans-serif';
      ctx.fillStyle = urgent ? (Math.sin(game.t * 8) > 0 ? '#ff4a5d' : '#ffb0b8') : '#dfe4ea';
      ctx.fillText(fmtTime(m.timer), W / 2, 46);
      ctx.font = 'bold 12px "Segoe UI", sans-serif';
      ctx.fillStyle = '#ffd166';
      ctx.fillText(m.def.name, W / 2, 64);
      ctx.textAlign = 'left';
    } else if (m) {
      ctx.textAlign = 'center';
      ctx.font = 'bold 13px "Segoe UI", sans-serif';
      ctx.fillStyle = 'rgba(255,209,102,0.85)';
      ctx.fillText(m.def.name, W / 2, 34);
      ctx.textAlign = 'left';
    }

    // ---- minimap (bottom-left, circular) ----
    const mx = 24 + this.minimapR, my = H - 24 - this.minimapR;
    ctx.fillStyle = 'rgba(6,6,12,0.8)';
    ctx.beginPath(); ctx.arc(mx, my, this.minimapR + 5, 0, TAU); ctx.fill();
    renderMinimap(game, ctx, mx, my, this.minimapR);
    ctx.strokeStyle = 'rgba(255,209,102,0.55)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(mx, my, this.minimapR + 1, 0, TAU); ctx.stroke();
    // N marker
    ctx.fillStyle = '#ff5da2';
    ctx.font = 'bold 11px "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('N', mx, my - this.minimapR - 2);
    // active objective distance under the map
    if (m) {
      const target = game.missions.markers.find((k) => k.id === 'obj' || k.id === 'story');
      if (target) {
        const d = Math.round(Math.hypot(target.x - (p.inCar ? p.inCar.x : p.x), target.y - (p.inCar ? p.inCar.y : p.y)));
        ctx.fillStyle = target.color;
        ctx.fillText('» ' + d + 'm to ' + (target.label || 'objective'), mx, my + this.minimapR + 16);
      }
    }
    // hidden packages progress
    if (game.stats && game.stats.packages > 0) {
      ctx.fillStyle = '#8cff5d';
      ctx.fillText('PKG ' + game.stats.packages + '/' + (game.world.hidden ? game.world.hidden.length : 12), mx, my + this.minimapR + 30);
    }
    ctx.textAlign = 'left';

    // ---- speedo (bottom-right) ----
    if (p.inCar) {
      const mph = Math.round(p.inCar.speed * 0.68);
      ctx.fillStyle = 'rgba(6,6,12,0.72)';
      roundBox(ctx, W - 190, H - 92, 166, 68, 8);
      // needle arc gauge
      const cxg = W - 66, cyg = H - 40, rg = 34;
      const frac = clamp(p.inCar.speed / (p.inCar.def.max * 1.18), 0, 1);
      ctx.strokeStyle = 'rgba(255,255,255,0.14)';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(cxg, cyg, rg, Math.PI * 0.75, Math.PI * 1.75);
      ctx.stroke();
      ctx.strokeStyle = p.inCar.speedFwd < -4 ? '#ff9d3c' : frac > 0.75 ? '#ff4a5d' : '#8cff5d';
      ctx.beginPath();
      ctx.arc(cxg, cyg, rg, Math.PI * 0.75, Math.PI * 0.75 + Math.PI * frac);
      ctx.stroke();
      // needle
      const na = Math.PI * 0.75 + Math.PI * frac;
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cxg, cyg);
      ctx.lineTo(cxg + Math.cos(na) * (rg - 6), cyg + Math.sin(na) * (rg - 6));
      ctx.stroke();
      ctx.fillStyle = '#dfe4ea';
      ctx.font = 'bold 15px "Segoe UI", sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(String(mph), W - 66, H - 44);
      ctx.font = 'bold 12px "Segoe UI", sans-serif';
      ctx.fillStyle = '#8a93a2';
      ctx.fillText('MPH', W - 34, H - 44);
      ctx.textAlign = 'left';
      // nitro indicator
      if (p.inCar.nitroGlow > 0.05) {
        ctx.fillStyle = '#8ac9ff';
        ctx.font = 'bold 12px "Segoe UI", sans-serif';
        ctx.fillText('NITRO!', W - 178, H - 52);
      }
    // ---- gear + car name ----
      ctx.fillStyle = p.inCar.speedFwd < -4 ? '#ff9d3c' : '#8cff5d';
      ctx.font = 'bold 13px "Segoe UI", sans-serif';
      const gear = p.inCar.speedFwd < -4 ? 'R' : p.inCar.speed < 2 ? 'N' : Math.min(5, 1 + Math.floor(p.inCar.engineLevel * 5)) + '';
      ctx.fillText(p.inCar.def.name + ' · ' + gear, W - 178, H - 36);
      // damage bar
      const dmg = 1 - clamp(p.inCar.hp / p.inCar.maxHp, 0, 1);
      ctx.fillStyle = dmg > 0.55 ? '#ff4a5d' : '#ffd166';
      ctx.fillRect(W - 178, H - 30, 150 * dmg, 8);
      ctx.strokeStyle = 'rgba(255,255,255,0.25)';
      ctx.strokeRect(W - 178, H - 30, 150, 8);
    }

    // ---- off-screen marker edge arrows ----
    if (game.vis) {
      const halfW = CFG.VIEW_W / 2 / game.cam.zoom, halfH = CFG.VIEW_H / 2 / game.cam.zoom;
      for (const mk of game.missions.markers) {
        const sx = mk.x - game.cam.x, sy = mk.y - game.cam.y;
        if (Math.abs(sx) < halfW - 40 && Math.abs(sy) < halfH - 40) continue; // on screen
        const a = Math.atan2(sy, sx);
        const ex = clamp(CFG.VIEW_W / 2 + Math.cos(a) * (CFG.VIEW_W / 2 - 40), 40, CFG.VIEW_W - 40);
        const ey = clamp(CFG.VIEW_H / 2 + Math.sin(a) * (CFG.VIEW_H / 2 - 40), 40, CFG.VIEW_H - 40);
        ctx.save();
        ctx.translate(ex, ey);
        ctx.rotate(a);
        ctx.fillStyle = mk.color;
        ctx.globalAlpha = 0.8;
        ctx.beginPath();
        ctx.moveTo(10, 0); ctx.lineTo(-6, -7); ctx.lineTo(-6, 7);
        ctx.closePath(); ctx.fill();
        ctx.restore();
        ctx.globalAlpha = 1;
      }
    }

    // ---- subtitle (bottom-center) ----
    if (this.subT > 0) {
      const a = clamp(this.subT, 0, 1);
      ctx.globalAlpha = a;
      ctx.textAlign = 'center';
      ctx.font = '600 17px "Segoe UI", sans-serif';
      const tw = ctx.measureText(this.subText).width;
      ctx.fillStyle = 'rgba(6,6,12,0.78)';
      roundBox(ctx, W / 2 - tw / 2 - 16, H - 118, tw + 32, 34, 6);
      ctx.fillStyle = '#ffe9a8';
      ctx.fillText(this.subText, W / 2, H - 96);
      ctx.globalAlpha = 1;
      ctx.textAlign = 'left';
    }

    // ---- toasts (right of minimap, stacked) ----
    ctx.font = 'bold 14px "Segoe UI", sans-serif';
    this.toasts.forEach((t, i) => {
      const a = clamp(t.t, 0, 1);
      ctx.globalAlpha = a;
      ctx.textAlign = 'center';
      const y = H - 40 - i * 26;
      const tw = ctx.measureText(t.text).width;
      ctx.fillStyle = 'rgba(6,6,12,0.7)';
      roundBox(ctx, mx + this.minimapR + 14, y - 18, tw + 18, 24, 5);
      ctx.fillStyle = '#dfe4ea';
      ctx.fillText(t.text, mx + this.minimapR + 14 + (tw + 18) / 2, y);
      ctx.globalAlpha = 1;
      ctx.textAlign = 'left';
    });

    // ---- banner (center) ----
    if (this.bannerT > 0) {
      const a = Math.min(1, this.bannerT * 2);
      ctx.globalAlpha = a;
      ctx.textAlign = 'center';
      ctx.font = '800 44px "Segoe UI", sans-serif';
      ctx.shadowColor = '#ff5da2'; ctx.shadowBlur = 18;
      ctx.fillStyle = '#fff';
      ctx.fillText(this.bannerTitle, W / 2, H / 2 - 20);
      ctx.shadowBlur = 0;
      if (this.bannerSub) {
        ctx.font = 'bold 20px "Segoe UI", sans-serif';
        ctx.fillStyle = '#ffd166';
        ctx.fillText(this.bannerSub, W / 2, H / 2 + 16);
      }
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
      ctx.textAlign = 'left';
    }

    // ---- crosshair ----
    if (p.alive && !game.state.startsWith('screen')) {
      const mx2 = game.input.mouse.x, my2 = game.input.mouse.y;
      ctx.strokeStyle = p.ammo > 0 ? 'rgba(255,209,102,0.9)' : 'rgba(160,160,170,0.5)';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(mx2, my2, 9, 0, TAU);
      ctx.moveTo(mx2 - 14, my2); ctx.lineTo(mx2 - 5, my2);
      ctx.moveTo(mx2 + 5, my2); ctx.lineTo(mx2 + 14, my2);
      ctx.moveTo(mx2, my2 - 14); ctx.lineTo(mx2, my2 - 5);
      ctx.moveTo(mx2, my2 + 5); ctx.lineTo(mx2, my2 + 14);
      ctx.stroke();
      // hide OS cursor over canvas handled by CSS
    }
  }
}

function roundBox(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
  ctx.fill();
}

function drawStar(ctx, x, y, r, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 === 0 ? r : r * 0.45;
    const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
}
