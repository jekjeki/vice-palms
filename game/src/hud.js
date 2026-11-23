// ---------------------------------------------------------------------------
// hud.js — in-game overlay: health & armour bars, money, wanted stars, speedo,
// weapon + ammo, objective, mission timer, subtitles, toasts and the
// button hints. Pure canvas, drawn after the renderer each frame.
// ---------------------------------------------------------------------------

import { CFG } from './config.js';
import { VIEW } from './view.js';
import { fmtMoney, fmtTime, clamp, headingDeg } from './util.js';

const FONT = '"Segoe UI", Arial, sans-serif';

export class HUD {
  constructor() {
    this.toast = null;         // {text, t}
    this.toastT = 0;
  }

  showToast(text, dur = 3.2) {
    this.toast = text;
    this.toastT = dur;
  }

  update(dt) {
    if (this.toastT > 0) {
      this.toastT -= dt;
      if (this.toastT <= 0) this.toast = null;
    }
  }

  render(g, game) {
    const p = game.player;
    g.textAlign = 'left';
    g.textBaseline = 'alphabetic';

    if (this.cut) {
      g.textAlign = 'center';
      g.font = `bold 14px ${FONT}`;
      g.fillStyle = 'rgba(200,215,235,0.6)';
      g.fillText('— VICE PALMS —', VIEW.w / 2, VIEW.h - bar / 2 + 4);
      g.textAlign = 'left';
    }

    // ---- off-screen objective chevron (follow the first marker)
    const marks = game.missions.markers();
    if (marks.length) {
      const m0 = marks[0];
      const sp = game.renderer.worldToScreen(m0.x, m0.y);
      const pad = 46;
      if (sp.x < pad || sp.x > VIEW.w - pad || sp.y < pad || sp.y > VIEW.h - pad) {
        // clamp to screen edge and aim
        const cx = VIEW.w / 2, cy = VIEW.h / 2;
        const dx = sp.x - cx, dy = sp.y - cy;
        const ang = Math.atan2(dy, dx);
        const edge = Math.min(
          (VIEW.w / 2 - pad) / Math.abs(Math.cos(ang) || 0.0001),
          (VIEW.h / 2 - pad) / Math.abs(Math.sin(ang) || 0.0001),
        );
        const ex = cx + Math.cos(ang) * edge;
        const ey = cy + Math.sin(ang) * edge;
        g.save();
        g.translate(ex, ey);
        g.rotate(ang);
        g.fillStyle = 'rgba(255,232,150,0.9)';
        g.beginPath();
        g.moveTo(10, 0); g.lineTo(-6, -7); g.lineTo(-6, 7);
        g.closePath();
        g.fill();
        g.restore();
        // distance readout
        const dm = Math.round(Math.hypot(m0.x - p.x, m0.y - p.y) / 10);
        g.font = `bold 10px ${FONT}`;
        g.textAlign = 'center';
        g.fillStyle = 'rgba(255,232,150,0.7)';
        g.fillText(dm + '0m', ex, ey + 18);
        g.textAlign = 'left';
      }
    }

    // ---- cutscene letterbox (when a mission cutscene runs)
    const bar = game.missions.cutsceneBars ? game.missions.cutsceneBars(g) : 0;
    if (bar > 1) {
      g.fillStyle = '#05060a';
      g.fillRect(0, 0, VIEW.w, bar);
      g.fillRect(0, VIEW.h - bar, VIEW.w, bar);
    }

    // ---- health / armour (top right, below the wallet)
    const bx = VIEW.w - 232, by = 44, bw = 210, bh = 15;
    this._bar(g, bx, by, bw, bh, p.health / CFG.HEALTH_MAX, '#e8484f', 'H');
    if (p.armor > 0) this._bar(g, bx, by + 20, bw, bh, p.armor / CFG.ARMOR_MAX, '#4fa3e8', 'A');

    // ---- money (top right corner, above the bars)
    g.font = `bold 24px ${FONT}`;
    g.textAlign = 'right';
    g.fillStyle = '#0a0a0a';
    g.fillText(fmtMoney(p.money), VIEW.w - 19, 34 + 2);
    g.fillStyle = '#7ce8a0';
    g.fillText(fmtMoney(p.money), VIEW.w - 20, 34);
    g.textAlign = 'left';

    // ---- earnings ticker (left edge, above the event log)
    const gains = game.recentGains || [];
    g.font = `bold 13px ${FONT}`;
    for (let i = 0; i < gains.length; i++) {
      const a = clamp(gains[i].t, 0, 1);
      g.fillStyle = gains[i].v >= 0 ? `rgba(124,232,160,${a})` : `rgba(232,72,79,${a})`;
      g.fillText((gains[i].v >= 0 ? '+' : '') + fmtMoney(gains[i].v), 22, 116 + i * 18);
    }

    // ---- wanted stars (under the bars) + decay bar
    const stars = game.police.wanted;
    // wanted tagline at high heat
    if (stars >= 3) {
      g.font = `bold 12px ${FONT}`;
      g.textAlign = 'right';
      const tag = stars >= 5 ? 'ARMED & DANGEROUS — SHOOT ON SIGHT' : stars === 4 ? 'AIR UNIT DISPATCHED' : 'ROADBLOCKS AUTHORIZED';
      const blinkOn = Math.floor(game.time * 2.5) % 2 === 0;
      g.fillStyle = blinkOn ? '#ff5e5e' : 'rgba(255,94,94,0.4)';
      g.fillText(tag, VIEW.w - 20, 122);
      g.textAlign = 'left';
    }
    for (let i = 0; i < CFG.WANTED_MAX; i++) {
      const x = VIEW.w - 26 - i * 22;
      const on = i < stars;
      // the newest star pings larger for a moment
      const age = game.police.starAge !== undefined ? game.police.starAge : 99;
      const ping = on && i === stars - 1 && age < 0.6 ? 1 + (0.6 - age) * 1.6 : 1;
      const flash = on && i === stars - 1 && Math.floor(game.time * 3) % 2 === 0;
      this._star(g, x, 96, 8 * ping, on ? (flash ? '#ffffff' : '#ffd23e') : 'rgba(255,255,255,0.13)');
    }
    // heat cooling bar (thin line under the stars) — shows decay toward the next star-down
    if (stars > 0) {
      const heatInStar = (game.police.heat % CFG.HEAT_PER_STAR) / CFG.HEAT_PER_STAR;
      g.fillStyle = 'rgba(255,255,255,0.14)';
      g.fillRect(VIEW.w - 232, 108, 120, 3);
      g.fillStyle = '#ffd23e';
      g.fillRect(VIEW.w - 232, 108, 120 * heatInStar, 3);
    }

    // ---- event log (last 4 police events, top-left under the weapon)
    const log = game.police._log || [];
    if (log.length) {
      g.font = `12px ${FONT}`;
      for (let i = 0; i < log.length; i++) {
        const e = log[i];
        const a = clamp(e.t, 0, 1);
        g.fillStyle = `rgba(210,220,235,${0.55 * a})`;
        g.fillText(e.text, 20, 92 + i * 17);
      }
    }

    // ---- radio banner (when the station changes)
    if (game.radioBannerT > 0 && game.radioBanner) {
      const a = clamp(game.radioBannerT, 0, 1);
      g.font = `bold 14px ${FONT}`;
      g.textAlign = 'right';
      g.fillStyle = `rgba(255,210,62,${a})`;
      g.fillText('📻 ' + game.radioBanner, VIEW.w - 24, 132);
      g.textAlign = 'left';
    }

    // ---- stamina pips (on foot, when not full)
    if (!p.inCar && p.stamina < 100) {
      const sx = VIEW.w / 2 - 60, sy = VIEW.h - 42;
      g.fillStyle = 'rgba(8,10,14,0.6)';
      g.fillRect(sx - 2, sy - 2, 124, 10);
      g.fillStyle = p.stamina > 25 ? '#7ce8a0' : '#e8a44f';
      g.fillRect(sx, sy, 1.2 * p.stamina, 6);
      if (p.swimming) {
        g.fillStyle = '#8fd0ff';
        g.font = `bold 11px ${FONT}`;
        g.fillText('SWIMMING — find shore', sx, sy - 6);
      }
    }

    // ---- weapon + ammo (top left)
    g.font = `bold 15px ${FONT}`;
    g.fillStyle = 'rgba(10,14,20,0.65)';
    this._panel(g, 16, 16, 168, 56);
    g.fillStyle = '#dfe6ee';
    g.fillText(p.weapon === 'pistol' ? 'PISTOL' : 'FISTS', 28, 38);
    if (p.weapon === 'pistol') {
      g.font = `bold 18px ${FONT}`;
      g.fillStyle = p.ammo > 0 ? '#ffd23e' : '#e8484f';
      g.fillText(p.ammo + ' rds', 28, 60);
    } else {
      g.font = `bold 13px ${FONT}`;
      g.fillStyle = '#8fa0b0';
      g.fillText('press 2 for pistol', 28, 60);
    }

    // ---- speedo (bottom right, only in a car)
    if (p.inCar && !p.inCar.wrecked) {
      const mph = Math.abs(p.inCar.speed) * 0.24;
      g.font = `bold 15px ${FONT}`;
      g.fillStyle = 'rgba(10,14,20,0.65)';
      this._panel(g, VIEW.w - 190, VIEW.h - 92, 174, 74);
      g.font = `bold 38px ${FONT}`;
      g.fillStyle = '#dfe6ee';
      g.textAlign = 'right';
      g.fillText(String(Math.round(mph)), VIEW.w - 92, VIEW.h - 42);
      g.font = `bold 13px ${FONT}`;
      g.fillStyle = '#8fa0b0';
      g.fillText('MPH', VIEW.w - 88, VIEW.h - 42);
      // gear-ish damage readout
      const dmg = p.inCar.damage01;
      g.fillStyle = dmg < 0.4 ? '#7ce8a0' : dmg < 0.75 ? '#ffd23e' : '#e8484f';
      g.fillRect(VIEW.w - 176, VIEW.h - 32, 146 * (1 - dmg), 7);
      g.fillStyle = 'rgba(255,255,255,0.15)';
      g.fillRect(VIEW.w - 176 + 146 * (1 - dmg), VIEW.h - 32, 146 * dmg, 7);
      g.textAlign = 'left';
    }

    // objective panel shows the straight-line distance
    const obj = game.missions.objectiveText();
    if (obj) {
      g.font = `bold 15px ${FONT}`;
      g.textAlign = 'center';
      const t = obj;
      const marks2 = game.missions.markers();
      const dist = marks2.length ? ' · ' + Math.round(Math.hypot(marks2[0].x - p.x, marks2[0].y - p.y) / 10) + '00m' : '';
      const w = g.measureText(t + dist).width + 30;
      g.fillStyle = 'rgba(10,14,20,0.62)';
      this._panel(g, VIEW.w / 2 - w / 2, 14, w, 30);
      g.fillStyle = '#ffe89a';
      g.fillText(t + dist, VIEW.w / 2, 34);
      g.textAlign = 'left';
    }
    const timer = game.missions.timerText();
    if (timer) {
      g.font = `bold 26px ${FONT}`;
      g.textAlign = 'center';
      const low = game.missions.timer < 12;
      g.fillStyle = low && Math.floor(game.time * 4) % 2 === 0 ? '#ff5e5e' : '#ffd23e';
      g.fillText(timer, VIEW.w / 2, 74);
      g.textAlign = 'left';
    }

    // ---- subtitles (bottom centre)
    const sub = game.missions.sub;
    if (sub) {
      g.font = `15px ${FONT}`;
      g.textAlign = 'center';
      const a = Math.min(1, sub.t * 3);
      const lines = this._wrap(g, sub.text, 620);
      let y = VIEW.h - 26 - (lines.length - 1) * 20;
      for (const line of lines) {
        g.fillStyle = `rgba(0,0,0,${0.65 * a})`;
        g.fillText(line, VIEW.w / 2 + 1, y + 1);
        g.fillStyle = `rgba(240,244,250,${a})`;
        g.fillText(line, VIEW.w / 2, y);
        y += 20;
      }
      g.textAlign = 'left';
    }

    // ---- toast (below centre)
    if (this.toast) {
      g.font = `bold 18px ${FONT}`;
      g.textAlign = 'center';
      const a = clamp(this.toastT * 2, 0, 1);
      g.fillStyle = `rgba(0,0,0,${0.6 * a})`;
      const w = g.measureText(this.toast).width + 36;
      this._panel(g, VIEW.w / 2 - w / 2, VIEW.h - 118, w, 34);
      g.fillStyle = `rgba(255,220,120,${a})`;
      g.fillText(this.toast, VIEW.w / 2, VIEW.h - 95);
      g.textAlign = 'left';
    }

    // ---- area + vehicle name plates (left edge, elegant)
    if (game.areaToastT > 0 && game.areaToast) {
      const a = clamp(game.areaToastT, 0, 1);
      g.font = `bold 30px ${FONT}`;
      g.textAlign = 'left';
      g.fillStyle = `rgba(10,12,18,${0.5 * a})`;
      g.fillText(game.areaToast, 58, VIEW.h - 152 + 2);
      g.fillStyle = `rgba(255,232,150,${a})`;
      g.fillText(game.areaToast, 57, VIEW.h - 153);
      g.fillStyle = `rgba(63,217,255,${0.8 * a})`;
      g.fillRect(58, VIEW.h - 146, 150 * Math.min(1, (3 - game.areaToastT) * 2 + 0.4), 3);
    }
    if (game.carToastT > 0 && game.carToast) {
      const a = clamp(game.carToastT, 0, 1);
      g.font = `bold italic 18px ${FONT}`;
      g.textAlign = 'left';
      g.fillStyle = `rgba(220,228,240,${a})`;
      g.fillText(game.carToast, 58, VIEW.h - 116);
    }
    if (game.streetToastT > 0 && game.lastStreet) {
      const a = clamp(game.streetToastT, 0, 1);
      g.font = `12px ${FONT}`;
      g.textAlign = 'left';
      g.fillStyle = `rgba(200,215,235,${0.7 * a})`;
      g.fillText('· ' + game.lastStreet, 58, VIEW.h - 96);
    }

    // ---- compass strip (top centre under the objective)
    this._compass(g, game);

    // ---- fps (bottom-right corner, discreet)
    if (game.fps) {
      g.font = `11px ${FONT}`;
      g.fillStyle = 'rgba(200,212,230,0.35)';
      g.textAlign = 'right';
      g.fillText(game.fps.toFixed(0) + ' fps', VIEW.w - 10, VIEW.h - 8);
      g.textAlign = 'left';
    }

    // ---- hints (bottom centre, small)
    g.font = `12px ${FONT}`;
    g.textAlign = 'center';
    g.fillStyle = 'rgba(200,210,225,0.4)';
    const hints = p.inCar
      ? 'W/S gas & brake · A/D steer · SPACE handbrake · F exit · click fire'
      : 'WASD move · SHIFT sprint · F enter/carjack · mouse aim · click fire · 1/2 weapon · ESC pause';
    g.fillText(hints, VIEW.w / 2, VIEW.h - 8);
    g.textAlign = 'left';
  }

  _compass(g, game) {
    const cx = VIEW.w / 2, cy = 108, w = 260;
    const deg = headingDeg(game.player.angle);
    g.save();
    g.fillStyle = 'rgba(10,14,20,0.5)';
    this._panel(g, cx - w / 2, cy - 14, w, 22);
    // ticks every 30°, player heading centred
    g.font = `10px ${FONT}`;
    g.textAlign = 'center';
    for (let off = -60; off <= 60; off += 15) {
      const d = (deg + off + 360) % 360;
      const x = cx + off * 2;
      if (d % 90 === 0) {
        g.fillStyle = '#ffd23e';
        g.fillText(['E', 'S', 'W', 'N'][d / 90], x, cy + 2);
      } else if (d % 30 === 0) {
        g.fillStyle = 'rgba(220,228,240,0.5)';
        g.fillRect(x - 1, cy - 4, 2, 6);
      }
    }
    // centre needle
    g.fillStyle = '#ff4d9d';
    g.fillRect(cx - 1, cy - 10, 2, 8);
    g.restore();
    g.textAlign = 'left';
  }

  _wrap(g, text, maxW) {
    const words = text.split(' ');
    const lines = [];
    let cur = '';
    for (const w of words) {
      const t = cur ? cur + ' ' + w : w;
      if (g.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; }
      else cur = t;
    }
    if (cur) lines.push(cur);
    return lines;
  }

  _bar(g, x, y, w, h, f, color, tag) {
    g.fillStyle = 'rgba(8,10,14,0.66)';
    g.fillRect(x - 2, y - 2, w + 4, h + 4);
    g.fillStyle = 'rgba(255,255,255,0.09)';
    g.fillRect(x, y, w, h);
    const fw = clamp(f, 0, 1) * w;
    g.fillStyle = color;
    g.fillRect(x, y, fw, h);
    g.font = `bold 11px ${FONT}`;
    g.fillStyle = 'rgba(240,244,250,0.9)';
    g.textAlign = 'right';
    g.fillText(tag, x - 6, y + h - 3);
    g.textAlign = 'left';
  }

  _panel(g, x, y, w, h) {
    g.fillRect(x, y, w, h);
    g.strokeStyle = 'rgba(255,255,255,0.14)';
    g.lineWidth = 1;
    g.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  }

  _star(g, cx, cy, r, color) {
    g.save();
    g.translate(cx, cy);
    g.beginPath();
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + i * (Math.PI * 2 / 5);
      const a2 = a + Math.PI / 5;
      g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      g.lineTo(Math.cos(a2) * r * 0.45, Math.sin(a2) * r * 0.45);
    }
    g.closePath();
    g.fillStyle = color;
    g.fill();
    g.restore();
  }
}
