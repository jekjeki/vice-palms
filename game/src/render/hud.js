// The HUD: circular minimap with pre-rendered road network, health and armor bars, money,
// wanted stars, mission subtitles and objective, and a speedometer while driving.

import { BLOCKS, PITCH, BEACH_W, WORLD_W } from '../config.js';
import { clamp, TAU } from '../util.js';

const MINI_SIZE = 720;
const MINI_SPAN = 1500; // world units across the minimap circle

export class Hud {
  constructor() {
    this.map = this.prerenderMap();
  }

  prerenderMap() {
    const c = document.createElement('canvas');
    c.width = MINI_SIZE; c.height = MINI_SIZE;
    const g = c.getContext('2d');
    const world = BLOCKS * PITCH + BEACH_W;
    const m = MINI_SIZE / world;
    g.fillStyle = '#0c1020';
    g.fillRect(0, 0, MINI_SIZE, MINI_SIZE);
    // Water and sand
    g.fillStyle = '#12273e';
    g.fillRect(BLOCKS * PITCH * m, 0, (BEACH_W + 2000) * m, MINI_SIZE);
    g.fillStyle = '#8a744c';
    g.fillRect(BLOCKS * PITCH * m, 0, BEACH_W * m, MINI_SIZE);
    return c;
  }

  attach(game) {
    // Paint block types onto the prerendered minimap once the city exists.
    const world = BLOCKS * PITCH + BEACH_W;
    const m = MINI_SIZE / world;
    const g = this.map.getContext('2d');
    for (const block of game.city.blocks) {
      const x = block.i * PITCH * m, y = block.j * PITCH * m;
      const s = PITCH * m;
      if (block.type === 'park') g.fillStyle = '#1d4a2c';
      else if (block.type === 'plaza') g.fillStyle = '#3d4358';
      else if (block.type === 'lot') g.fillStyle = '#23262e';
      else g.fillStyle = '#2b2f3c';
      g.fillRect(x, y, s, s);
    }
    // Roads over the blocks.
    g.strokeStyle = '#8d93a8';
    g.lineWidth = Math.max(1, 90 * m * 0.8);
    g.beginPath();
    for (let i = 0; i <= BLOCKS; i++) {
      g.moveTo(i * PITCH * m, 0); g.lineTo(i * PITCH * m, BLOCKS * PITCH * m);
      g.moveTo(0, i * PITCH * m); g.lineTo(BLOCKS * PITCH * m, i * PITCH * m);
    }
    g.stroke();
  }

  draw(ctx, game, W, H) {
    const p = game.player;
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    // ---- minimap (bottom-left) ----
    const mr = 88;
    const mx = 24 + mr, my = H - 24 - mr;
    ctx.save();
    ctx.beginPath();
    ctx.arc(mx, my, mr, 0, TAU);
    ctx.clip();
    ctx.fillStyle = '#0a0e1a';
    ctx.fillRect(mx - mr, my - mr, mr * 2, mr * 2);
    const world = BLOCKS * PITCH + BEACH_W;
    const m = MINI_SIZE / world;
    const srcSpan = MINI_SPAN * m;
    const sx = clamp(p.x * m - srcSpan / 2, 0, MINI_SIZE - srcSpan);
    const sy = clamp(p.y * m - srcSpan / 2, 0, MINI_SIZE - srcSpan);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.map, sx, sy, srcSpan, srcSpan, mx - mr, my - mr, mr * 2, mr * 2);
    const toMini = (wx, wy) => {
      const dx = (wx * m - sx) / srcSpan * mr * 2 - mr;
      const dy = (wy * m - sy) / srcSpan * mr * 2 - mr;
      return [mx + dx, my + dy];
    };
    // Mission marker
    const marker = game.missions.marker();
    if (marker) {
      const [ax, ay] = toMini(marker.x, marker.y);
      const cx = clamp(ax, mx - mr + 10, mx + mr - 10);
      const cy = clamp(ay, my - mr + 10, my + mr - 10);
      ctx.fillStyle = marker.color;
      ctx.beginPath(); ctx.arc(cx, cy, 5, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 1.5; ctx.stroke();
    }
    // Police blips
    for (const c of game.police.cars) {
      if (c.dead || c.exploded) continue;
      const [bx, by] = toMini(c.x, c.y);
      if (Math.hypot(bx - mx, by - my) < mr - 6) {
        ctx.fillStyle = Math.floor(game.time * 6) % 2 ? '#4a7dff' : '#ff4a55';
        ctx.beginPath(); ctx.arc(bx, by, 4, 0, TAU); ctx.fill();
      }
    }
    // Player arrow
    const heading = p.heading;
    ctx.save();
    ctx.translate(mx, my);
    ctx.rotate(heading + Math.PI / 2);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(0, -8); ctx.lineTo(6, 7); ctx.lineTo(0, 4); ctx.lineTo(-6, 7);
    ctx.closePath(); ctx.fill();
    ctx.restore();
    ctx.restore();
    // Ring
    ctx.strokeStyle = 'rgba(255,220,160,0.75)';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(mx, my, mr, 0, TAU); ctx.stroke();
    ctx.strokeStyle = 'rgba(0,0,0,0.55)';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(mx, my, mr + 2.5, 0, TAU); ctx.stroke();

    // ---- health + armor bars (above the minimap) ----
    this.bar(ctx, mx - mr, my - mr - 26, mr * 2, 12, p.health / 100, '#3dff7a', '#173a22');
    if (p.armor > 0) this.bar(ctx, mx - mr, my - mr - 44, mr * 2, 12, p.armor / 100, '#5db3ff', '#16303f');

    // ---- money (top-right) ----
    ctx.textAlign = 'right';
    ctx.font = 'bold 26px Consolas, "Courier New", monospace';
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillText(`$${p.money.toLocaleString()}`, W - 26 + 2, 44 + 2);
    ctx.fillStyle = '#9dffb0';
    ctx.fillText(`$${p.money.toLocaleString()}`, W - 26, 44);

    // ---- wanted stars (below money) ----
    const stars = game.wanted.stars;
    for (let s = 0; s < 5; s++) {
      const x = W - 42 - s * 30, y = 74;
      this.star(ctx, x, y, 11, s < stars, s < stars && Math.floor(game.time * 4) % 2 === 0);
    }

    // ---- ammo / weapon (top-left) ----
    ctx.textAlign = 'left';
    ctx.font = 'bold 20px Consolas, "Courier New", monospace';
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillText(p.weapon === 'pistol' ? `PISTOL ${p.ammo}` : 'FISTS', 28 + 2, 42 + 2);
    ctx.fillStyle = '#ffe9a3';
    ctx.fillText(p.weapon === 'pistol' ? `PISTOL ${p.ammo}` : 'FISTS', 28, 42);

    // ---- speedometer (bottom-right, while driving) ----
    const car = p.inCar;
    if (car) {
      const kmh = Math.abs(car.speed) * 0.42 | 0;
      const cx = W - 110, cy = H - 96, r = 56;
      ctx.strokeStyle = 'rgba(10,14,24,0.75)';
      ctx.lineWidth = 12;
      ctx.beginPath(); ctx.arc(cx, cy, r, Math.PI * 0.75, Math.PI * 2.25); ctx.stroke();
      const frac = clamp(Math.abs(car.speed) / car.def.top, 0, 1);
      ctx.strokeStyle = frac > 0.85 ? '#ff5f4a' : frac > 0.6 ? '#ffd24a' : '#59e0ff';
      ctx.beginPath(); ctx.arc(cx, cy, r, Math.PI * 0.75, Math.PI * 0.75 + Math.PI * 1.5 * frac); ctx.stroke();
      ctx.textAlign = 'center';
      ctx.font = 'bold 24px Consolas, "Courier New", monospace';
      ctx.fillStyle = '#e8ecf4';
      ctx.fillText(`${kmh}`, cx, cy + 8);
      ctx.font = '12px Consolas, "Courier New", monospace';
      ctx.fillStyle = '#9aa3b8';
      ctx.fillText('KM/H', cx, cy + 26);
      ctx.font = 'bold 13px Consolas, "Courier New", monospace';
      ctx.fillStyle = '#c8cede';
      ctx.fillText(car.def.name.toUpperCase(), cx, cy - r - 12);
    }

    // ---- objective + subtitles (bottom-center) ----
    const obj = game.missions.objectiveText();
    ctx.textAlign = 'center';
    ctx.font = 'bold 17px Consolas, "Courier New", monospace';
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillText(obj, W / 2 + 1, H - 33 + 1);
    ctx.fillStyle = '#ffd977';
    ctx.fillText(obj, W / 2, H - 33);

    // Mission banner
    const msn = game.missions;
    if (msn.bannerT > 0) {
      const a = clamp(msn.bannerT, 0, 1);
      ctx.globalAlpha = a;
      ctx.font = 'bold 44px Consolas, "Courier New", monospace';
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillText(msn.bannerText, W / 2 + 2, H * 0.2 + 2);
      ctx.fillStyle = msn.bannerColor;
      ctx.fillText(msn.bannerText, W / 2, H * 0.2);
      ctx.font = '18px Consolas, "Courier New", monospace';
      ctx.fillStyle = '#dfe4ee';
      wrapText(ctx, msn.bannerSub ?? '', W / 2, H * 0.2 + 40, W * 0.7, 24);
      ctx.globalAlpha = 1;
    }

    // Wasted / busted state text
    if (game.state === 'wasted' || game.state === 'busted') {
      ctx.fillStyle = game.state === 'wasted' ? 'rgba(90,8,16,0.45)' : 'rgba(10,20,80,0.45)';
      ctx.fillRect(0, 0, W, H);
      ctx.font = 'bold 84px Consolas, "Courier New", monospace';
      ctx.fillStyle = game.state === 'wasted' ? '#ff5a5a' : '#7aa2ff';
      ctx.fillText(game.state === 'wasted' ? 'WASTED' : 'BUSTED', W / 2, H / 2);
      ctx.font = '20px Consolas, "Courier New", monospace';
      ctx.fillStyle = '#e8ecf4';
      const fee = Math.max(50, Math.floor(p.money * (game.state === 'busted' ? 0.2 : 0.15)));
      ctx.fillText(game.state === 'wasted' ? `Hospital bill: -$${fee}` : `Bail: -$${fee}`, W / 2, H / 2 + 44);
    }
  }

  bar(ctx, x, y, w, h, f, color, back) {
    ctx.fillStyle = back;
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = color;
    ctx.fillRect(x + 2, y + 2, (w - 4) * clamp(f, 0, 1), h - 4);
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x, y, w, h);
  }

  star(ctx, x, y, r, on, blink) {
    ctx.beginPath();
    for (let k = 0; k < 10; k++) {
      const a = -Math.PI / 2 + (k * Math.PI) / 5;
      const rad = k % 2 === 0 ? r : r * 0.44;
      const px = x + Math.cos(a) * rad, py = y + Math.sin(a) * rad;
      k === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
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

function wrapText(ctx, text, x, y, maxW, lineH) {
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
