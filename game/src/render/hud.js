// The HUD: a circular minimap over a pre-rendered city map, health and armor bars, a money
// counter, the wanted star row, weapon readout, mission objective and subtitles, and a
// speedometer gauge while driving. Every element is drawn on one canvas pass.

import { GRID, PITCH, SAND } from '../config.js';
import { clamp, TAU } from '../util.js';

const MAP_PX = 760;
const MAP_SPAN = 1500;   // world units shown across the minimap circle

export class Hud {
  constructor() {
    this.underlay = this.bakeMap();
  }

  /** Pre-render the static city map once: land, parks, lots, plaza, beach, roads. */
  bakeMap() {
    const c = document.createElement('canvas');
    c.width = MAP_PX; c.height = MAP_PX;
    const g = c.getContext('2d');
    const span = GRID * PITCH + SAND;
    const k = MAP_PX / span;
    g.fillStyle = '#0c1020';
    g.fillRect(0, 0, MAP_PX, MAP_PX);
    g.fillStyle = '#12273e';
    g.fillRect(GRID * PITCH * k, 0, (SAND + 2000) * k, MAP_PX);
    g.fillStyle = '#8a744c';
    g.fillRect(GRID * PITCH * k, 0, SAND * k, MAP_PX);
    return c;
  }

  /** Stamp block kinds and roads onto the baked map for the freshly generated city. */
  attach(game) {
    const span = GRID * PITCH + SAND;
    const k = MAP_PX / span;
    const g = this.underlay.getContext('2d');
    for (const block of game.city.blocks) {
      const x = block.i * PITCH * k, y = block.j * PITCH * k, s = PITCH * k;
      g.fillStyle = block.kind === 'park' ? '#1d4a2c'
        : block.kind === 'plaza' ? '#3d4358'
        : block.kind === 'lot' ? '#23262e'
        : '#2b2f3c';
      g.fillRect(x, y, s, s);
    }
    g.strokeStyle = '#8d93a8';
    g.lineWidth = Math.max(1, 90 * k * 0.8);
    g.beginPath();
    for (let i = 0; i <= GRID; i++) {
      g.moveTo(i * PITCH * k, 0); g.lineTo(i * PITCH * k, GRID * PITCH * k);
      g.moveTo(0, i * PITCH * k); g.lineTo(GRID * PITCH * k, i * PITCH * k);
    }
    g.stroke();
  }

  draw(ctx, game, W, H) {
    const p = game.player;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.minimap(ctx, game, p, H);
    this.vitals(ctx, game, p);
    this.money(ctx, p, W);
    this.stars(ctx, game, W);
    this.weapon(ctx, p);
    this.speedo(ctx, p, W, H);
    this.objective(ctx, game, W, H);
    this.banner(ctx, game, W, H);
    this.endState(ctx, game, p, W, H);
  }

  minimap(ctx, game, p, H) {
    const r = 90;
    const mx = 26 + r, my = H - 26 - r;
    const span = GRID * PITCH + SAND;
    const k = MAP_PX / span;
    ctx.save();
    ctx.beginPath();
    ctx.arc(mx, my, r, 0, TAU);
    ctx.clip();
    ctx.fillStyle = '#0a0e1a';
    ctx.fillRect(mx - r, my - r, r * 2, r * 2);
    const viewPx = MAP_SPAN * k;
    const sx = clamp(p.x * k - viewPx / 2, 0, MAP_PX - viewPx);
    const sy = clamp(p.y * k - viewPx / 2, 0, MAP_PX - viewPx);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.underlay, sx, sy, viewPx, viewPx, mx - r, my - r, r * 2, r * 2);
    const toMini = (wx, wy) => [mx + ((wx * k - sx) / viewPx) * r * 2 - r, my + ((wy * k - sy) / viewPx) * r * 2 - r];

    // Mission marker, clamped to the rim so off-screen goals still show direction.
    const marker = game.missions.marker();
    if (marker) {
      const [ax, ay] = toMini(marker.x, marker.y);
      const cx = clamp(ax, mx - r + 10, mx + r - 10);
      const cy = clamp(ay, my - r + 10, my + r - 10);
      ctx.fillStyle = marker.color;
      ctx.beginPath(); ctx.arc(cx, cy, 5, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.6)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    // Police blips.
    for (const c of game.cops.cruisers) {
      if (c.wreck || c.wasted) continue;
      const [bx, by] = toMini(c.x, c.y);
      if (Math.hypot(bx - mx, by - my) < r - 6) {
        ctx.fillStyle = Math.floor(game.time * 6) % 2 ? '#4a7dff' : '#ff4a55';
        ctx.beginPath(); ctx.arc(bx, by, 4, 0, TAU); ctx.fill();
      }
    }
    // Player arrow, pointing along the heading.
    ctx.save();
    ctx.translate(mx, my);
    ctx.rotate(p.heading + Math.PI / 2);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(0, -8); ctx.lineTo(6, 7); ctx.lineTo(0, 4); ctx.lineTo(-6, 7);
    ctx.closePath(); ctx.fill();
    ctx.restore();
    ctx.restore();
    // Double ring: warm inner glow, dark rim.
    ctx.strokeStyle = 'rgba(255,222,160,0.8)';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(mx, my, r, 0, TAU); ctx.stroke();
    ctx.strokeStyle = 'rgba(0,0,0,0.55)';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(mx, my, r + 2.5, 0, TAU); ctx.stroke();

    // Health and armor sit above the minimap.
    this.bar(ctx, mx - r, my - r - 28, r * 2, 13, p.health / 100, '#3dff7a', '#173a22');
    if (p.armor > 0) this.bar(ctx, mx - r, my - r - 46, r * 2, 13, p.armor / 100, '#5db3ff', '#16303f');
  }

  vitals(ctx, game, p) { /* drawn inside minimap() above the map ring */ }

  bar(ctx, x, y, w, h, f, color, back) {
    ctx.fillStyle = back;
    this.rounded(ctx, x, y, w, h, 4);
    ctx.fill();
    ctx.fillStyle = color;
    if (f > 0.02) { this.rounded(ctx, x + 2, y + 2, Math.max(6, (w - 4) * clamp(f, 0, 1)), h - 4, 3); ctx.fill(); }
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.lineWidth = 1.5;
    this.rounded(ctx, x, y, w, h, 4);
    ctx.stroke();
  }

  rounded(ctx, x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }

  money(ctx, p, W) {
    ctx.textAlign = 'right';
    ctx.font = 'bold 27px Consolas, "Courier New", monospace';
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillText(`$${p.money.toLocaleString()}`, W - 27 + 2, 45 + 2);
    ctx.fillStyle = '#9dffb0';
    ctx.fillText(`$${p.money.toLocaleString()}`, W - 27, 45);
  }

  stars(ctx, game, W) {
    const lit = game.wanted.stars;
    for (let s = 0; s < 5; s++) {
      const x = W - 43 - s * 31, y = 76;
      this.star(ctx, x, y, 11, s < lit, s < lit && Math.floor(game.time * 4) % 2 === 0);
    }
  }

  weapon(ctx, p) {
    ctx.textAlign = 'left';
    ctx.font = 'bold 20px Consolas, "Courier New", monospace';
    const label = p.weapon === 'pistol' ? `PISTOL ${p.ammo}` : 'FISTS';
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillText(label, 29, 43);
    ctx.fillStyle = '#ffe9a3';
    ctx.fillText(label, 27, 41);
  }

  speedo(ctx, p, W, H) {
    const car = p.car;
    if (!car) return;
    const kmh = (Math.abs(car.fwd) * 0.42) | 0;
    const cx = W - 112, cy = H - 98, r = 58;
    ctx.strokeStyle = 'rgba(10,14,24,0.75)';
    ctx.lineWidth = 13;
    ctx.beginPath(); ctx.arc(cx, cy, r, Math.PI * 0.75, Math.PI * 2.25); ctx.stroke();
    const f = clamp(Math.abs(car.fwd) / car.spec.top, 0, 1);
    ctx.strokeStyle = f > 0.85 ? '#ff5f4a' : f > 0.6 ? '#ffd24a' : '#59e0ff';
    ctx.beginPath(); ctx.arc(cx, cy, r, Math.PI * 0.75, Math.PI * 0.75 + Math.PI * 1.5 * f); ctx.stroke();
    ctx.textAlign = 'center';
    ctx.font = 'bold 25px Consolas, "Courier New", monospace';
    ctx.fillStyle = '#e8ecf4';
    ctx.fillText(`${kmh}`, cx, cy + 9);
    ctx.font = '12px Consolas, "Courier New", monospace';
    ctx.fillStyle = '#9aa3b8';
    ctx.fillText('KM/H', cx, cy + 27);
    ctx.font = 'bold 13px Consolas, "Courier New", monospace';
    ctx.fillStyle = '#c8cede';
    ctx.fillText(car.spec.name.toUpperCase(), cx, cy - r - 13);
  }

  objective(ctx, game, W, H) {
    const text = game.missions.objectiveText();
    ctx.textAlign = 'center';
    ctx.font = 'bold 17px Consolas, "Courier New", monospace';
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillText(text, W / 2 + 1, H - 34 + 1);
    ctx.fillStyle = '#ffd977';
    ctx.fillText(text, W / 2, H - 34);
  }

  banner(ctx, game, W, H) {
    const m = game.missions;
    if (m.bannerT <= 0) return;
    const a = clamp(m.bannerT, 0, 1);
    ctx.globalAlpha = a;
    ctx.textAlign = 'center';
    ctx.font = 'bold 46px Consolas, "Courier New", monospace';
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillText(m.bannerText, W / 2 + 2, H * 0.2 + 2);
    ctx.fillStyle = m.bannerColor;
    ctx.fillText(m.bannerText, W / 2, H * 0.2);
    ctx.font = '18px Consolas, "Courier New", monospace';
    ctx.fillStyle = '#dfe4ee';
    this.wrap(ctx, m.bannerSub ?? '', W / 2, H * 0.2 + 42, W * 0.7, 24);
    ctx.globalAlpha = 1;
  }

  endState(ctx, game, p, W, H) {
    if (game.state !== 'wasted' && game.state !== 'busted') return;
    ctx.fillStyle = game.state === 'wasted' ? 'rgba(90,8,16,0.45)' : 'rgba(10,20,80,0.45)';
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center';
    ctx.font = 'bold 86px Consolas, "Courier New", monospace';
    ctx.fillStyle = game.state === 'wasted' ? '#ff5a5a' : '#7aa2ff';
    ctx.fillText(game.state === 'wasted' ? 'WASTED' : 'BUSTED', W / 2, H / 2);
    const fee = Math.max(50, Math.floor(p.money * (game.state === 'busted' ? 0.2 : 0.15)));
    ctx.font = '20px Consolas, "Courier New", monospace';
    ctx.fillStyle = '#e8ecf4';
    ctx.fillText(game.state === 'wasted' ? `Hospital bill: -$${fee}` : `Bail: -$${fee}`, W / 2, H / 2 + 46);
  }

  wrap(ctx, text, x, y, maxW, lineH) {
    const words = text.split(' ');
    let line = '';
    let yy = y;
    for (const w of words) {
      const test = line ? line + ' ' + w : w;
      if (ctx.measureText(test).width > maxW) {
        ctx.fillText(line, x, yy);
        line = w; yy += lineH;
      } else line = test;
    }
    if (line) ctx.fillText(line, x, yy);
  }

  star(ctx, x, y, r, on, blink) {
    ctx.beginPath();
    for (let k = 0; k < 10; k++) {
      const a = -Math.PI / 2 + (k * Math.PI) / 5;
      const rad = k % 2 === 0 ? r : r * 0.44;
      const px = x + Math.cos(a) * rad, py = y + Math.sin(a) * rad;
      if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
    if (on) {
      ctx.fillStyle = blink ? '#ffffff' : '#ffd24a';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,160,40,0.9)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    } else {
      ctx.strokeStyle = 'rgba(255,255,255,0.28)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }
}
