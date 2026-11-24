// hud.js — canvas HUD: health/armor/money/stars, speedo, subtitles,
// mission banner, circular minimap with blips.

import { CFG, ctx, VERSION } from './config.js';
import { clamp, fmtMoney, fmtTime, TAU, dist } from './util.js';
import { WEAPONS, WEAPON_ORDER } from './weapons.js';

export class Hud {
  constructor() {
    this.subtitle = null;      // {text, t}
    this.subtitle2 = null;
    this.starPulse = 0;
  }

  pushSubtitle(text, dur) {
    const s = { text, t: dur, dur };
    if (this.subtitle && this.subtitle.text === text) { this.subtitle.t = dur; return; }
    if (this.subtitle2 && this.subtitle2.text === text) { this.subtitle2.t = dur; return; }
    if (!this.subtitle || this.subtitle.t < 0.4) this.subtitle = s;
    else if (!this.subtitle2) this.subtitle2 = s;
    else {
      this.subtitle2 = this.subtitle;
      this.subtitle = s;
    }
  }

  update(dt) {
    for (const s of [this.subtitle, this.subtitle2]) {
      if (s) s.t -= dt;
    }
    if (this.subtitle && this.subtitle.t <= 0) this.subtitle = this.subtitle2;
    if (this.subtitle2 && this.subtitle2.t <= 0) this.subtitle2 = null;
    this.starPulse = Math.max(0, this.starPulse - dt);
  }

  draw(g, S) {
    const W = CFG.viewW, H = CFG.viewH;
    g.textBaseline = 'alphabetic';

    this.drawMoney(g, S);
    this.drawStars(g, S);
    this.drawBars(g, S);
    this.drawMinimap(g, S);
    this.drawSpeedo(g, S);
    this.drawMissionInfo(g, S);
    this.drawSubtitles(g, S);
    this.drawBanner(g, S);
    this.drawHints(g, S);
  }

  drawMoney(g, S) {
    g.font = 'bold 26px "Courier New", monospace';
    g.textAlign = 'right';
    const txt = fmtMoney(S.money);
    g.fillStyle = 'rgba(0,0,0,0.6)';
    g.fillText(txt, CFG.viewW - 208 + 2, 44);
    g.fillStyle = '#7ae85a';
    g.fillText(txt, CFG.viewW - 210, 42);
  }

  drawStars(g, S) {
    const lvl = ctx.police ? ctx.police.level : 0;
    g.font = '24px monospace';
    g.textAlign = 'right';
    for (let i = 0; i < 5; i++) {
      const x = CFG.viewW - 210 - i * 26;
      const y = 74;
      const on = i < lvl;
      g.fillStyle = on ? '#ffd24a' : 'rgba(255,255,255,0.14)';
      if (on) {
        const pulse = 1 + Math.sin(S.time * 6) * 0.08;
        this.star(g, x, y, 11 * pulse);
      } else {
        this.star(g, x, y, 10);
      }
    }
  }

  star(g, x, y, r) {
    g.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const rr = i % 2 === 0 ? r : r * 0.45;
      const px = x + Math.cos(a) * rr, py = y - r + r + Math.sin(a) * rr;
      if (i === 0) g.moveTo(px, py); else g.lineTo(px, py);
    }
    g.closePath();
    g.fill();
  }

  drawBars(g, S) {
    const p = S.player;
    const x = CFG.viewW - 206, y = 96, w = 190, h = 11;
    // health
    g.fillStyle = 'rgba(0,0,0,0.55)';
    g.fillRect(x - 2, y - 2, w + 4, h + 4);
    g.fillStyle = '#3a2028';
    g.fillRect(x, y, w, h);
    g.fillStyle = p.health < 30 ? '#ff4055' : '#e84a68';
    g.fillRect(x, y, w * clamp(p.health / CFG.playerMaxHealth, 0, 1), h);
    // armor
    const y2 = y + h + 6;
    g.fillStyle = 'rgba(0,0,0,0.55)';
    g.fillRect(x - 2, y2 - 2, w + 4, h + 4);
    g.fillStyle = '#1c2a44';
    g.fillRect(x, y2, w, h);
    g.fillStyle = '#5aa0f0';
    g.fillRect(x, y2, w * clamp(p.armor / CFG.playerMaxArmor, 0, 1), h);
    // weapon readout (current weapon + reserve)
    const wp = ctx.weapons;
    let wlabel = '';
    if (wp && !p.inCar) {
      const w = WEAPONS[wp.current];
      wlabel = w.melee ? w.name : w.name + ' ' + (wp.ammo[wp.current] || 0);
    }
    g.font = 'bold 15px monospace';
    g.textAlign = 'left';
    g.fillStyle = 'rgba(255,255,255,0.75)';
    g.fillText(wlabel, x, y2 + 26);
    // slots strip
    if (wp) {
      g.font = '11px monospace';
      let sx = x;
      for (const id of WEAPON_ORDER) {
        const w = WEAPONS[id];
        const owned = wp.owned.has(id);
        const cur = wp.current === id;
        g.fillStyle = cur ? '#f5c04a' : owned ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.12)';
        const code = { fists: '1:F', pistol: '2:P', shotgun: '3:SG', smg: '4:SM' }[id];
        g.fillText(code, sx, y2 + 44);
        sx += 34;
      }
    }
  }

  drawMinimap(g, S) {
    const R = CFG.minimapSize / 2;
    const cx = 18 + R, cy = CFG.viewH - 18 - R;
    const ren = ctx.renderer;
    const scale = CFG.minimapScale;
    const px = S.player.x, py = S.player.y;

    g.save();
    g.beginPath();
    g.arc(cx, cy, R, 0, TAU);
    g.clip();
    g.fillStyle = '#0a1420';
    g.fillRect(cx - R, cy - R, R * 2, R * 2);
    // map image, offset so player is centered
    const k = 560 / CFG.map;
    const imgR = R / scale;             // world radius shown
    g.drawImage(
      ren.minimap,
      (px - imgR) * k, (py - imgR) * k, imgR * 2 * k, imgR * 2 * k,
      cx - R, cy - R, R * 2, R * 2
    );
    // blips
    const blip = (wx, wy, color, r = 3) => {
      const dx = (wx - px) * scale, dy = (wy - py) * scale;
      if (dx * dx + dy * dy > (R - 4) * (R - 4)) {
        // clamp to rim
        const d = Math.hypot(dx, dy) || 1;
        const f = (R - 6) / d;
        g.fillStyle = color;
        g.beginPath(); g.arc(cx + dx * f, cy + dy * f, r * 0.8, 0, TAU); g.fill();
        return;
      }
      g.fillStyle = color;
      g.beginPath(); g.arc(cx + dx, cy + dy, r, 0, TAU); g.fill();
    };
    for (const m of S.missions.giverMarkers()) blip(m.x, m.y, '#f5c04a', 4);
    for (const m of S.missions.objectiveMarkers()) blip(m.x, m.y, '#f05ec8', 4);
    for (const car of ctx.cars) {
      if (car.ai === 'police' && !car.dead) blip(car.x, car.y, '#5aa0f0', 3);
    }
    // player arrow
    const p = S.player;
    const ang = p.inCar ? p.inCar.angle : p.angle;
    g.save();
    g.translate(cx, cy);
    g.rotate(ang);
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.moveTo(7, 0); g.lineTo(-5, -4.6); g.lineTo(-5, 4.6);
    g.closePath(); g.fill();
    g.restore();
    g.restore();

    // rim
    g.strokeStyle = 'rgba(255,255,255,0.35)';
    g.lineWidth = 3;
    g.beginPath(); g.arc(cx, cy, R + 1.5, 0, TAU); g.stroke();
    // north tick
    g.fillStyle = 'rgba(255,255,255,0.6)';
    g.font = 'bold 11px monospace';
    g.textAlign = 'center';
    g.fillText('N', cx, cy - R + 14);
  }

  drawSpeedo(g, S) {
    const p = S.player;
    if (!p.inCar) return;
    const car = p.inCar;
    const mph = Math.round(car.speed * 0.28);
    const x = CFG.viewW - 120, y = CFG.viewH - 60;
    g.fillStyle = 'rgba(0,0,0,0.5)';
    g.beginPath(); g.arc(x, y, 44, 0, TAU); g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.25)';
    g.lineWidth = 4;
    g.beginPath(); g.arc(x, y, 40, Math.PI * 0.75, Math.PI * 2.25); g.stroke();
    // speed arc
    const frac = clamp(car.speed / car.spec.max, 0, 1);
    g.strokeStyle = frac > 0.85 ? '#ff4055' : '#7ae85a';
    g.lineWidth = 6;
    g.beginPath();
    g.arc(x, y, 40, Math.PI * 0.75, Math.PI * 0.75 + Math.PI * 1.5 * frac);
    g.stroke();
    g.fillStyle = '#f0f0f0';
    g.font = 'bold 24px monospace';
    g.textAlign = 'center';
    g.fillText(String(mph), x, y + 6);
    g.font = '10px monospace';
    g.fillStyle = 'rgba(255,255,255,0.6)';
    g.fillText('MPH', x, y + 20);
  }

  drawMissionInfo(g, S) {
    const M = S.missions;
    if (M.active) {
      const s = M.active.stages[M.stage];
      g.font = 'bold 15px monospace';
      g.textAlign = 'center';
      g.fillStyle = 'rgba(0,0,0,0.55)';
      const label = (s && s.text) ? s.text.toUpperCase() : M.active.title.toUpperCase();
      const tw = g.measureText(label).width;
      g.fillRect(CFG.viewW / 2 - tw / 2 - 12, 16, tw + 24, 24);
      g.fillStyle = '#f0a0c8';
      g.fillText(label, CFG.viewW / 2, 33);
      // timers
      if (M.stageTime >= 0) {
        const t = fmtTime(M.stageTime);
        g.font = 'bold 20px monospace';
        g.fillStyle = M.stageTime < 10 ? '#ff4055' : '#f5c04a';
        g.fillText(t, CFG.viewW / 2, 62);
      }
      if (s && s.type === 'collect') {
        g.font = '14px monospace';
        g.fillStyle = 'rgba(255,255,255,0.8)';
        g.fillText(`${s.points.length - M.collectLeft.length} / ${s.points.length}`, CFG.viewW / 2, 62);
      }
      if (s && s.type === 'survive') {
        const t = fmtTime(M.surviveT);
        g.font = 'bold 20px monospace';
        g.fillStyle = '#f5c04a';
        g.fillText('HOLD: ' + t, CFG.viewW / 2, 62);
      }
    } else if (M.failMsg > 0) {
      g.font = 'bold 15px monospace';
      g.textAlign = 'center';
      g.fillStyle = '#ff7080';
      g.fillText('RETURN TO A YELLOW MARKER TO RETRY', CFG.viewW / 2, 33);
    }
  }

  drawSubtitles(g, S) {
    const draw = (s, y) => {
      if (!s) return;
      const alpha = Math.min(1, s.t * 2, (s.dur - s.t) * 6 + 0.3);
      g.font = '17px Georgia, serif';
      g.textAlign = 'center';
      const tw = g.measureText(s.text).width;
      g.fillStyle = `rgba(0,0,0,${0.62 * Math.min(1, alpha)})`;
      g.fillRect(CFG.viewW / 2 - tw / 2 - 14, y - 22, tw + 28, 30);
      g.fillStyle = `rgba(240,240,255,${Math.min(1, alpha)})`;
      g.fillText(s.text, CFG.viewW / 2, y);
    };
    draw(this.subtitle, CFG.viewH - 64);
    draw(this.subtitle2, CFG.viewH - 102);
  }

  drawBanner(g, S) {
    const b = S.missions.banner;
    if (!b) return;
    const W = CFG.viewW;
    const t = b.t;
    const dur = b.dur || 5;
    const a = Math.min(1, t * 1.5, (dur - t) * 2 + 0.3);
    g.globalAlpha = Math.min(1, Math.max(0, a));
    g.textAlign = 'center';
    g.font = 'bold 46px "Arial Black", sans-serif';
    g.fillStyle = 'rgba(0,0,0,0.65)';
    g.fillRect(0, CFG.viewH / 2 - 78, W, 120);
    g.fillStyle = '#f5c04a';
    g.fillText(b.title, W / 2, CFG.viewH / 2 - 22);
    g.font = '20px monospace';
    g.fillStyle = '#f0f0f0';
    g.fillText(b.sub, W / 2, CFG.viewH / 2 + 14);
    g.globalAlpha = 1;
  }

  drawHints(g, S) {
    // small bottom-right control hints, fade after first minute of play
    if (S.playTime > 75) return;
    const a = S.playTime > 60 ? (75 - S.playTime) / 15 : 1;
    g.globalAlpha = a * 0.75;
    g.font = '12px monospace';
    g.textAlign = 'right';
    g.fillStyle = '#cfd4e0';
    const lines = [
      'WASD move · SHIFT sprint',
      'F enter/exit/jack car · SPACE handbrake',
      'MOUSE aim · LMB shoot',
      'M mute · ESC pause',
    ];
    let y = CFG.viewH - 26;
    for (const l of lines) { g.fillText(l, CFG.viewW - 176, y); y -= 17; }
    g.globalAlpha = 1;
  }
}
