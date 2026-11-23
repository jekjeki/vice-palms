// hud.js — the overlay: health/armor bars, money, wanted stars, subtitles,
// speedo, mission timer, region name and the circular minimap.

import { CFG } from './config.js';
import { fmtMoney, fmtTime, pxToMph, clamp, TAU } from './util.js';

export class Hud {
  constructor(game) {
    this.game = game;
    this.subs = [];          // {text, t, dur}
    this.missionBanner = null; // {name, payout, t}
    this.wantedFlash = 0;
    this.bigMsg = null;      // {text, t, dur, color}
  }

  subtitle(text, dur) {
    this.subs.push({ text, t: 0, dur: dur || 3 });
    if (this.subs.length > 3) this.subs.shift();
  }

  missionPassed(name, payout) {
    this.missionBanner = { name, payout, t: 0 };
  }

  big(text, dur, color) {
    this.bigMsg = { text, t: 0, dur, color: color || '#ff5c5c' };
  }

  flashWanted() {
    this.wantedFlash = 1;
  }

  update(dt) {
    for (const s of this.subs) s.t += dt;
    this.subs = this.subs.filter((s) => s.t < s.dur);
    this.wantedFlash = Math.max(0, this.wantedFlash - dt);
    if (this.missionBanner) {
      this.missionBanner.t += dt;
      if (this.missionBanner.t > 4) this.missionBanner = null;
    }
    if (this.bigMsg) {
      this.bigMsg.t += dt;
      if (this.bigMsg.t > this.bigMsg.dur) this.bigMsg = null;
    }
  }

  draw(ctx) {
    const game = this.game;
    const W = game.viewW, H = game.viewH;
    const p = game.player;
    if (game.photoMode && game.state === 'play') {
      // photo mode keeps only the tiny fps meter
      if (game.showFps && game.fps) {
        ctx.textAlign = 'left';
        ctx.font = 'bold 11px "Courier New", monospace';
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.fillText(`${Math.round(game.fps)} fps`, 12, 18);
      }
      return;
    }

    // ---- top-left: health + armor
    this.bar(ctx, 24, 24, 190, 13, p.health / CFG.PLAYER_HP, '#6ee06e', 'HEALTH');
    if (p.armor > 0) this.bar(ctx, 24, 44, 150, 10, p.armor / CFG.PLAYER_ARMOR_MAX, '#7fb6ff', 'ARMOR');
    if (p.weapon === 1) {
      ctx.fillStyle = '#ffd23d';
      ctx.font = 'bold 14px "Courier New", monospace';
      ctx.textAlign = 'left';
      ctx.fillText(`AMMO ${p.ammo}`, 24, 74);
    } else {
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.font = 'bold 12px "Courier New", monospace';
      ctx.textAlign = 'left';
      ctx.fillText('FISTS', 24, 74);
    }
    // ---- palm token tally
    if (game.tokens) {
      ctx.font = 'bold 12px "Courier New", monospace';
      ctx.fillStyle = 'rgba(95, 255, 138, 0.8)';
      ctx.fillText(`\u{1F334} ${game.tokens.collected}/${game.tokens.total}`, 24, 92);
    }
    // ---- courier streak
    if (game.delivery && game.delivery.streak > 1) {
      ctx.font = 'bold 12px "Courier New", monospace';
      ctx.fillStyle = 'rgba(55, 245, 255, 0.8)';
      ctx.fillText(`COURIER x${game.delivery.streak}`, 24, 110);
    }
    // ---- fps meter
    if (game.showFps && game.fps) {
      ctx.font = 'bold 11px "Courier New", monospace';
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.fillText(`${Math.round(game.fps)} fps`, 24, 128);
    }

    // ---- top-right: money + stars
    ctx.textAlign = 'right';
    ctx.font = 'bold 20px "Courier New", monospace';
    ctx.fillStyle = '#0a0c10';
    ctx.fillText(fmtMoney(p.money), W - 26 + 1.5, 38 + 1.5);
    ctx.fillStyle = '#7dff8a';
    ctx.fillText(fmtMoney(p.money), W - 26, 38);

    const stars = game.police.wanted;
    for (let i = 0; i < 5; i++) {
      const x = W - 34 - i * 26;
      const on = i < stars;
      const flashing = on && game.police.flashT > 0 && Math.sin(game.time * 12) > 0;
      drawStar(ctx, x, 62, 9, on ? (flashing ? '#ffffff' : CFG.NIGHT.star) : 'rgba(255,255,255,0.14)');
    }

    // ---- region name under money
    ctx.font = 'bold 13px "Courier New", monospace';
    ctx.fillStyle = 'rgba(255, 210, 90, 0.8)';
    ctx.fillText(game.world.regionName(game.cam.x, game.cam.y), W - 26, 88);

    // ---- speedo (in car)
    if (p.car && !p.car.exploded) {
      this.speedo(ctx, W - 88, H - 88, p.car);
    }

    // ---- mission timer
    const tl = game.missions.timeLeft() ?? (game.delivery ? game.delivery.timeLeft() : null);
    if (tl !== null) {
      ctx.textAlign = 'center';
      ctx.font = 'bold 26px "Courier New", monospace';
      ctx.fillStyle = tl < 10 ? '#ff5c5c' : '#ffd23d';
      ctx.fillText(fmtTime(tl), W / 2, 46);
    }

    // ---- objective text (top center, small)
    const st = game.missions.current;
    if (st) {
      const step = st.def.steps[st.step];
      if (step && step.text) {
        ctx.textAlign = 'center';
        ctx.font = 'bold 13px "Courier New", monospace';
        ctx.fillStyle = 'rgba(255,255,255,0.75)';
        ctx.fillText(step.text, W / 2, 72);
      }
      if (st.def.name) {
        ctx.textAlign = 'center';
        ctx.font = 'bold 12px "Courier New", monospace';
        ctx.fillStyle = 'rgba(255, 210, 90, 0.65)';
        ctx.fillText(st.def.name.toUpperCase(), W / 2, 90);
      }
    }

    // ---- subtitles bottom centre
    let sy = H - 44;
    ctx.textAlign = 'center';
    for (let i = this.subs.length - 1; i >= 0; i--) {
      const s = this.subs[i];
      const alpha = clamp(Math.min(s.t * 4, (s.dur - s.t) * 3), 0, 1);
      ctx.font = 'bold 15px "Courier New", monospace';
      ctx.fillStyle = `rgba(6,8,12,${0.75 * alpha})`;
      const wid = ctx.measureText(s.text).width + 24;
      ctx.fillRect(W / 2 - wid / 2, sy - 16, wid, 22);
      ctx.fillStyle = `rgba(255,255,255,${alpha})`;
      ctx.fillText(s.text, W / 2, sy);
      sy -= 28;
    }

    // ---- mission passed banner
    if (this.missionBanner) {
      const b = this.missionBanner;
      const a = clamp(Math.min(b.t * 3, (4 - b.t) * 2), 0, 1);
      ctx.textAlign = 'center';
      ctx.globalAlpha = a;
      ctx.font = 'bold 42px "Courier New", monospace';
      ctx.fillStyle = '#0a0c10';
      ctx.fillText('MISSION PASSED!', W / 2 + 2, H * 0.4 + 2);
      ctx.fillStyle = '#7dff8a';
      ctx.fillText('MISSION PASSED!', W / 2, H * 0.4);
      ctx.font = 'bold 22px "Courier New", monospace';
      ctx.fillStyle = '#ffd23d';
      ctx.fillText(`${b.name.toUpperCase()}   ·   RESPECT +   ·   ${fmtMoney(b.payout)}`, W / 2, H * 0.4 + 38);
      ctx.globalAlpha = 1;
    }

    // ---- big warning text
    if (this.bigMsg) {
      const b = this.bigMsg;
      const a = clamp(Math.min(b.t * 5, (b.dur - b.t) * 3), 0, 1);
      ctx.textAlign = 'center';
      ctx.globalAlpha = a;
      ctx.font = 'bold 30px "Courier New", monospace';
      ctx.fillStyle = '#0a0c10';
      ctx.fillText(b.text, W / 2 + 2, H * 0.3 + 2);
      ctx.fillStyle = b.color;
      ctx.fillText(b.text, W / 2, H * 0.3);
      ctx.globalAlpha = 1;
    }

    // ---- offscreen objective arrow
    this.drawObjectiveArrow(ctx, W, H, p);

    // ---- minimap bottom-left
    game.renderer.drawMiniMap(ctx, 108, H - 108, 84);

    // ---- radio station toast
    const toast = game.radio && game.radio.toast();
    if (toast) {
      ctx.textAlign = 'right';
      ctx.font = 'bold 13px "Courier New", monospace';
      ctx.fillStyle = 'rgba(8,10,16,0.7)';
      const w2 = ctx.measureText(toast).width + 20;
      ctx.fillRect(W - 24 - w2, H - 66, w2, 20);
      ctx.fillStyle = '#37f5ff';
      ctx.fillText(toast, W - 34, H - 52);
    }

    // ---- Pay 'n' Spray hint
    if (game.nearSpray && game.nearSpray(p.x, p.y) && p.car) {
      ctx.textAlign = 'center';
      ctx.font = 'bold 13px "Courier New", monospace';
      ctx.fillStyle = '#e0b23d';
      ctx.fillText('PAY \u2019N\u2019 SPRAY — hold here: $300 repairs + cool the heat', W / 2, H - 76);
    }
  }

  /** Edge arrow pointing at the current goal when it leaves the screen. */
  drawObjectiveArrow(ctx, W, H, p) {
    const game = this.game;
    let goal = null, color = '#ffd23d';
    const marks = game.missions.markers();
    const obj = marks.find((m) => m.kind === 'objective' || m.kind === 'checkpoint');
    if (obj) {
      goal = obj.pos;
      color = obj.kind === 'checkpoint' ? '#37f5ff' : '#ffd23d';
    } else if (marks.length) {
      goal = marks[0].pos;
    }
    if (!goal && game.delivery && game.delivery.active) {
      goal = game.delivery.active.drop;
      color = '#5cff8a';
    }
    if (!goal) return;
    // world -> screen
    const zoom = game.cam.zoom;
    const sx = (goal.x - game.cam.x) * zoom + W / 2;
    const sy = (goal.y - game.cam.y) * zoom + H / 2;
    const margin = 64;
    if (sx > margin && sx < W - margin && sy > margin && sy < H - margin) return;
    // clamp to the edge and aim
    const cx = W / 2, cy = H / 2;
    const ang = Math.atan2(sy - cy, sx - cx);
    const rx = Math.min(W / 2 - margin, Math.abs(Math.cos(ang)) > 1e-6 ? Math.abs((W / 2 - margin) / Math.cos(ang)) : 1e9);
    const ry = Math.min(H / 2 - margin, Math.abs(Math.sin(ang)) > 1e-6 ? Math.abs((H / 2 - margin) / Math.sin(ang)) : 1e9);
    const r = Math.min(rx, ry);
    const ax = cx + Math.cos(ang) * r;
    const ay = cy + Math.sin(ang) * r;
    ctx.save();
    ctx.translate(ax, ay);
    ctx.rotate(ang);
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.75 + 0.25 * Math.sin(game.time * 6);
    ctx.beginPath();
    ctx.moveTo(14, 0);
    ctx.lineTo(-8, -9);
    ctx.lineTo(-3, 0);
    ctx.lineTo(-8, 9);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  bar(ctx, x, y, w, h, f, color, label) {
    f = clamp(f, 0, 1);
    ctx.fillStyle = 'rgba(6, 8, 12, 0.72)';
    ctx.fillRect(x - 2, y - 2, w + 4, h + 4);
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w * f, h);
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    ctx.font = 'bold 9px "Courier New", monospace';
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.fillText(label, x + 4, y + h - 3);
  }

  speedo(ctx, cx, cy, car) {
    const mph = pxToMph(car.speed);
    ctx.save();
    ctx.translate(cx, cy);
    // dial
    ctx.fillStyle = 'rgba(6, 8, 12, 0.75)';
    ctx.beginPath();
    ctx.arc(0, 0, 40, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, 40, 0, TAU);
    ctx.stroke();
    // ticks
    const maxMph = 90;
    for (let i = 0; i <= 9; i++) {
      const a = Math.PI * 0.75 + (i / 9) * Math.PI * 1.5;
      ctx.strokeStyle = i >= 7 ? 'rgba(255,90,90,0.8)' : 'rgba(255,255,255,0.4)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * 30, Math.sin(a) * 30);
      ctx.lineTo(Math.cos(a) * 36, Math.sin(a) * 36);
      ctx.stroke();
    }
    // needle
    const f = clamp(Math.abs(mph) / maxMph, 0, 1);
    const a = Math.PI * 0.75 + f * Math.PI * 1.5;
    ctx.strokeStyle = '#ff5c5c';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(a) * 30, Math.sin(a) * 30);
    ctx.stroke();
    // digits
    ctx.fillStyle = '#ffd23d';
    ctx.font = 'bold 13px "Courier New", monospace';
    ctx.textAlign = 'center';
    ctx.fillText(String(Math.round(Math.abs(mph))), 0, 24);
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.font = 'bold 8px "Courier New", monospace';
    ctx.fillText('MPH', 0, 33);
    ctx.restore();
  }
}

/** Quick banner: the engine's self-description, rendered into the dossier. */
export const ENGINE_BANNER = [
  'VICE PALMS — night city, neon, palm trees.',
  'One canvas, zero libraries, zero network.',
  'Systems: world gen · arcade cars · lane traffic · peds ·',
  'police stars · boats · weather · radio · missions · tokens.',
];

/** Small helper the pause screen uses to show the engine banner. */
export function engineBannerLines() {
  return ENGINE_BANNER;
}

/** A 5-point star used by the wanted meter. */
export function drawStar(ctx, cx, cy, r, color) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i / 10) * TAU;
    const rr = i % 2 === 0 ? r : r * 0.45;
    const x = cx + Math.cos(a) * rr;
    const y = cy + Math.sin(a) * rr;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}
