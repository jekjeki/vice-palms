// ============================================================================
// VICE PALMS — hud.js
// Screen-space HUD: circular minimap with blips, health/armor bars, money,
// wanted stars, weapon + ammo, speedometer, mission objective + timer,
// subtitles and toast messages. Pure drawing — state lives in game/*.
// ============================================================================

import { VIEW_W, VIEW_H, WORLD_X0, WORLD_Y0, PLAYER, WANTED, RADIO } from './config.js';
import { clamp, money, timerStr, clockStr, TAU } from './util.js';

const MM_R = 88;            // minimap radius (px)
const MM_CENTER = [108, VIEW_H - 108];
const MM_PPU = 0.30;        // minimap px per world unit on screen
const MM_SRC = 0.26;        // prerendered minimap px per world unit

export class HUD {
  constructor(game) {
    this.game = game;
    this.toasts = [];
    this.toastT = 0;
    this.blink = 0;
  }

  toast(msg) {
    this.toasts.push({ msg, t: 0 });
    if (this.toasts.length > 3) this.toasts.shift();
  }

  draw(ctx) {
    const g = this.game;
    const p = g.player;
    ctx.textBaseline = 'alphabetic';
    this.drawMinimap(ctx);
    this.drawVitals(ctx, p);
    this.drawWanted(ctx, g);
    this.drawWeapon(ctx, p);
    this.drawObjective(ctx, g);
    this.drawSpeedo(ctx, g, p);
    this.drawSubtitles(ctx, g);
    this.drawToasts(ctx);
    this.drawClock(ctx, g);
    this.drawHurtVignette(ctx, p);
  }

  // ---------------------------------------------------------------- minimap
  drawMinimap(ctx) {
    const g = this.game;
    const p = g.player;
    const [cx, cy] = MM_CENTER;
    const mm = g.world.minimap;

    ctx.save();
    // Frame
    ctx.beginPath();
    ctx.arc(cx, cy, MM_R + 5, 0, TAU);
    ctx.fillStyle = 'rgba(8,10,18,0.82)';
    ctx.fill();
    ctx.strokeStyle = '#37e6ff';
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(55,230,255,0.25)';
    ctx.lineWidth = 6;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(cx, cy, MM_R, 0, TAU);
    ctx.clip();

    const k = MM_PPU / MM_SRC;
    const dx = cx - (p.x - WORLD_X0) * MM_SRC * k;
    const dy = cy - (p.y - WORLD_Y0) * MM_SRC * k;
    ctx.fillStyle = '#101322';
    ctx.fillRect(cx - MM_R, cy - MM_R, MM_R * 2, MM_R * 2);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(mm, dx, dy, mm.width * k, mm.height * k);
    ctx.imageSmoothingEnabled = true;

    // Blips
    const blip = (x, y, color, r = 3) => {
      let bx = cx + (x - p.x) * MM_PPU;
      let by = cy + (y - p.y) * MM_PPU;
      // clamp inside the circle for offscreen markers
      const ddx = bx - cx, ddy = by - cy;
      const d = Math.hypot(ddx, ddy);
      if (d > MM_R - 6) {
        bx = cx + ddx / d * (MM_R - 6);
        by = cy + ddy / d * (MM_R - 6);
      }
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(bx, by, r, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.6)';
      ctx.lineWidth = 1;
      ctx.stroke();
    };
    // Mission markers (always visible, clamped)
    for (const m of g.missions.markers) blip(m.x, m.y, m.color, 3.4);
    for (const m of g.missions.activeTargets()) blip(m.x, m.y, m.color, 3.4);
    // Cops
    if (g.police.stars() > 0) {
      for (const c of g.police.cruisers) {
        if (!c.remove && !c.wrecked) blip(c.x, c.y, '#ff4040', 2.6);
      }
    }
    // Player triangle
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(g.player.inCar ? g.player.inCar.angle : g.player.angle);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(6, 0); ctx.lineTo(-4, -4); ctx.lineTo(-4, 4);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    ctx.restore();

    // North marker
    ctx.fillStyle = '#37e6ff';
    ctx.font = '700 13px "Consolas", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('N', cx, cy - MM_R - 10);
    ctx.textAlign = 'left';
  }

  // ----------------------------------------------------------------- vitals
  drawVitals(ctx, p) {
    const x = VIEW_W - 218, y = 34;
    // Health
    ctx.fillStyle = 'rgba(6,8,14,0.72)';
    ctx.fillRect(x - 8, y - 16, 210, 88);
    ctx.fillStyle = '#232733';
    ctx.fillRect(x, y, 150, 12);
    ctx.fillStyle = p.hp > 30 ? '#43d96e' : '#e04444';
    ctx.fillRect(x, y, 150 * clamp(p.hp / PLAYER.HP_MAX, 0, 1), 12);
    // Armor
    ctx.fillStyle = '#232733';
    ctx.fillRect(x, y + 18, 150, 9);
    ctx.fillStyle = '#4f8fe0';
    ctx.fillRect(x, y + 18, 150 * clamp(p.armor / PLAYER.ARMOR_MAX, 0, 1), 9);
    // Stamina (on foot only)
    if (!p.inCar) {
      ctx.fillStyle = '#232733';
      ctx.fillRect(x, y + 31, 110, 5);
      ctx.fillStyle = p.stamina > 25 ? '#a8e063' : '#e0a04f';
      ctx.fillRect(x, y + 31, 110 * clamp(p.stamina / 100, 0, 1), 5);
    }
    // Money
    ctx.font = '700 22px "Consolas", monospace';
    ctx.fillStyle = '#0c0f16';
    ctx.fillText(money(p.money), x + 2, y + 60 + 2);
    ctx.fillStyle = '#7dffa8';
    ctx.fillText(money(p.money), x, y + 60);
    ctx.textAlign = 'left';
  }

  drawWanted(ctx, g) {
    const stars = g.police.stars();
    const decaying = g.police.seenTimer > WANTED.DECAY_SEEN;
    const x = VIEW_W - 40, y = 118;
    for (let i = 0; i < 5; i++) {
      const sx = x - i * 26;
      const active = i < stars;
      const on = active && (!decaying || Math.floor(this.blink * 3) % 2 === 0);
      this.star(ctx, sx, y, 10, on ? '#ffd23c' : 'rgba(255,255,255,0.14)');
    }
    if (decaying && stars > 0) {
      ctx.font = '11px "Consolas", monospace';
      ctx.fillStyle = 'rgba(255,210,60,0.75)';
      ctx.textAlign = 'right';
      ctx.fillText('LOSING THEM…', x, y + 26);
      ctx.textAlign = 'left';
    }
  }

  star(ctx, cx, cy, r, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + i * Math.PI / 5;
      const rr = i % 2 === 0 ? r : r * 0.45;
      const px = cx + Math.cos(a) * rr, py = cy + Math.sin(a) * rr;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
  }

  drawWeapon(ctx, p) {
    const w = p.weapon();
    const x = VIEW_W - 218, y = 132;
    ctx.fillStyle = 'rgba(6,8,14,0.72)';
    ctx.fillRect(x - 8, y - 14, 150, 34);
    ctx.font = '700 15px "Consolas", monospace';
    ctx.fillStyle = '#e8e6df';
    ctx.fillText(w.name, x, y + 8);
    if (w.id === 'pistol') {
      ctx.fillStyle = '#ffd75e';
      ctx.textAlign = 'right';
      ctx.fillText('x' + p.pistolAmmo, x + 134, y + 8);
      ctx.textAlign = 'left';
    }
    // Radio station (when driving)
    if (p.inCar) {
      ctx.font = '12px "Consolas", monospace';
      ctx.fillStyle = 'rgba(137,220,255,0.85)';
      ctx.fillText('♫ ' + RADIO[this.game.radio].name, x, y + 24);
    }
  }

  // -------------------------------------------------------------- objective
  drawObjective(ctx, g) {
    const m = g.missions;
    if (m.objective) {
      ctx.font = '700 16px "Consolas", monospace';
      ctx.fillStyle = 'rgba(6,8,14,0.72)';
      const w = ctx.measureText(m.objective).width;
      ctx.fillRect(18, 20, w + 22, 30);
      ctx.fillStyle = '#37e6ff';
      ctx.fillText(m.objective, 29, 41);
    }
    // Big mission timer top-center when it matters.
    const a = m.active;
    if (a && a.timer != null && a.timer < 30) {
      ctx.font = '700 34px "Consolas", monospace';
      ctx.textAlign = 'center';
      const red = a.timer < 10 && Math.floor(this.blink * 4) % 2 === 0;
      ctx.fillStyle = 'rgba(6,8,14,0.72)';
      ctx.fillRect(VIEW_W / 2 - 74, 16, 148, 44);
      ctx.fillStyle = red ? '#ff4040' : '#ffd23c';
      ctx.fillText(timerStr(a.timer), VIEW_W / 2, 49);
      ctx.textAlign = 'left';
    }
  }

  // ----------------------------------------------------------------- speedo
  drawSpeedo(ctx, g, p) {
    if (!p.inCar) return;
    const car = p.inCar;
    const kmh = Math.round(car.speed() * 3.6);
    const x = VIEW_W - 96, y = VIEW_H - 96;
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, 52, 0, TAU);
    ctx.fillStyle = 'rgba(8,10,18,0.8)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(55,230,255,0.5)';
    ctx.lineWidth = 3;
    ctx.stroke();
    // Needle
    const frac = clamp(car.speed() / (car.spec.top * 1.05), 0, 1);
    const a = Math.PI * 0.75 + frac * Math.PI * 1.5;
    ctx.strokeStyle = frac > 0.85 ? '#ff4040' : '#37e6ff';
    ctx.lineWidth = 3.4;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(a) * 40, y + Math.sin(a) * 40);
    ctx.stroke();
    ctx.font = '700 15px "Consolas", monospace';
    ctx.fillStyle = '#e8e6df';
    ctx.textAlign = 'center';
    ctx.fillText(kmh + ' km/h', x, y + 26);
    // Damage pips
    const segs = 10;
    for (let i = 0; i < segs; i++) {
      const on = car.health / 100 > i / segs;
      ctx.fillStyle = on ? (car.health > 40 ? '#43d96e' : car.health > 18 ? '#ffd23c' : '#ff4040') : 'rgba(255,255,255,0.1)';
      ctx.fillRect(x - 26 + i * 5.4, y - 40, 4, 5);
    }
    ctx.textAlign = 'left';
    ctx.restore();
  }

  // -------------------------------------------------------------- subtitles
  drawSubtitles(ctx, g) {
    const s = g.missions.currentSub();
    if (!s) return;
    const y = VIEW_H - 42;
    ctx.font = '16px "Consolas", monospace';
    ctx.textAlign = 'center';
    const text = s.speaker ? s.speaker + ': ' + s.text : s.text;
    const w = ctx.measureText(text).width;
    ctx.fillStyle = 'rgba(4,6,12,0.78)';
    ctx.fillRect(VIEW_W / 2 - w / 2 - 14, y - 22, w + 28, 32);
    if (s.speaker) {
      ctx.fillStyle = '#ffd23c';
      ctx.fillText(s.speaker + ':', VIEW_W / 2 - w / 2 + ctx.measureText(s.speaker + ': ').width / 2, y);
    }
    ctx.fillStyle = '#f2f0e8';
    ctx.fillText(text, VIEW_W / 2, y);
    ctx.textAlign = 'left';
  }

  drawToasts(ctx) {
    let y = 92;
    for (const t of this.toasts) {
      const a = t.t < 0.2 ? t.t / 0.2 : t.t > 2.6 ? 1 - (t.t - 2.6) / 0.6 : 1;
      ctx.globalAlpha = clamp(a, 0, 1);
      ctx.font = '700 17px "Consolas", monospace';
      ctx.textAlign = 'center';
      const w = ctx.measureText(t.msg).width;
      ctx.fillStyle = 'rgba(8,10,20,0.85)';
      ctx.fillRect(VIEW_W / 2 - w / 2 - 16, y - 18, w + 32, 28);
      ctx.fillStyle = '#ffd23c';
      ctx.fillText(t.msg, VIEW_W / 2, y + 2);
      y += 34;
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = 'left';
  }

  drawClock(ctx, g) {
    ctx.font = '700 15px "Consolas", monospace';
    ctx.fillStyle = 'rgba(232,230,223,0.7)';
    ctx.textAlign = 'left';
    ctx.fillText(clockStr(g.time) + '  ·  ' + g.world.streetAt(g.player.x, g.player.y), 22, VIEW_H - 20);
    if (g.fpsMode) {
      ctx.fillStyle = 'rgba(125,255,168,0.85)';
      ctx.fillText(Math.round(g._fpsEma) + ' FPS', 22, VIEW_H - 40);
    }
    ctx.textAlign = 'left';
  }

  // GTA-style vehicle name banner when you take a new ride.
  vehicleBanner(name) {
    this._vName = name;
    this._vT = 0;
  }

  update(dt) {
    for (const t of this.toasts) t.t += dt;
    this.toasts = this.toasts.filter(t => t.t < 3.2);
    this.blink += dt;
    if (this._vName) {
      this._vT += dt;
      if (this._vT > 3.4) this._vName = null;
    }
  }

  drawVehicleBanner(ctx) {
    if (!this._vName) return;
    const a = this._vT < 0.25 ? this._vT / 0.25 : this._vT > 2.8 ? Math.max(0, 1 - (this._vT - 2.8) / 0.6) : 1;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.textAlign = 'right';
    ctx.font = '700 26px "Consolas", monospace';
    ctx.fillStyle = '#0c0f16';
    ctx.fillText(this._vName, VIEW_W - 26 + 2, VIEW_H - 132 + 2);
    ctx.fillStyle = '#ffd23c';
    ctx.fillText(this._vName, VIEW_W - 26, VIEW_H - 132);
    ctx.textAlign = 'left';
    ctx.restore();
  }

  drawHurtVignette(ctx, p) {
    const g = this.game;
    const low = p.hp < 32 ? (1 - p.hp / 32) * 0.45 : 0;
    const flash = Math.max(0, p.hurtFlash) * 0.35;
    const a = Math.max(low, flash);
    if (a < 0.01) return;
    const grad = ctx.createRadialGradient(VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.3, VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.75);
    grad.addColorStop(0, 'rgba(180,0,0,0)');
    grad.addColorStop(1, `rgba(180,0,0,${a})`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  }
}
