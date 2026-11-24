// Vice Palms — HUD: health/armor/money/stars, speedo, weapon, subtitles, minimap.

import { VIEW_W, VIEW_H, COLORS, KEYS } from './config.js';
import { fmtMoney, fmtTime, shadowText, clamp, rgba } from './util.js';
import { objectiveText } from './missions.js';

export function drawHUD(game, render) {
  const ctx = render.ctx;
  const p = game.player;
  const mode = game.screens.mode;
  if (mode === 'title') return;

  ctx.setTransform(1, 0, 0, 1, 0, 0);

  // ---------- minimap (top-left)
  render.drawMinimap(ctx, game, 100, 100, 84);

  // ---------- right cluster
  const rx = VIEW_W - 26;

  // wanted stars
  const wanted = game.police.wanted;
  for (let i = 0; i < 5; i++) {
    const sx = rx - (4 - i) * 30;
    const sy = 40;
    const filled = i < wanted;
    const flash = wanted > 0 && Math.floor(game.time * 4) % 2 === 0 && i === wanted - 1;
    drawStar(ctx, sx, sy, 11, filled ? (flash ? '#ffffff' : COLORS.gold) : 'rgba(255,255,255,0.16)');
  }

  // money
  shadowText(ctx, fmtMoney(p.money), rx, 76, 26, COLORS.money, 'right');

  // health bar
  bar(ctx, rx - 150, 90, 150, 10, p.hp / 100, COLORS.hp, '#3a1018');
  // armor bar
  if (p.armor > 0 || true) bar(ctx, rx - 150, 106, 150, 7, p.armor / 100, COLORS.armor, '#101c3a');

  // ---------- weapon (bottom-left)
  const wy = VIEW_H - 34;
  ctx.fillStyle = 'rgba(6,8,14,0.55)';
  ctx.fillRect(200, wy - 26, 150, 36);
  ctx.strokeStyle = 'rgba(255,255,255,0.14)';
  ctx.strokeRect(200.5, wy - 25.5, 149, 35);
  const wname = W_NAME[p.weapon] || 'FISTS';
  const wcol = p.weapon === 0 ? '#c9ccd6' : '#ffd12d';
  shadowText(ctx, wname, 212, wy - 2, 16, wcol, 'left');
  shadowText(ctx, p.weapon === 0 ? '--' : String(p.ammo[p.weapon] || 0), 338, wy - 2, 16, wcol, 'right');

  // ---------- speedo (bottom-right)
  if (p.inCar) {
    const kmh = Math.round(Math.abs(p.inCar.speed) * 0.42);
    shadowText(ctx, String(kmh), VIEW_W - 70, VIEW_H - 40, 40, '#ffffff', 'right');
    shadowText(ctx, 'km/h', VIEW_W - 26, VIEW_H - 40, 14, 'rgba(255,255,255,0.6)', 'right');
    // handbrake drift hint
    if (p.inCar.handbrake && Math.abs(p.inCar.speed) > 120) {
      shadowText(ctx, 'DRIFT', VIEW_W - 26, VIEW_H - 66, 16, '#ff2d78', 'right');
    }
  }

  // ---------- objective (top-center)
  const obj = objectiveText(game);
  if (obj && mode === 'playing') {
    ctx.font = 'bold 15px "Segoe UI", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    const w = ctx.measureText(obj).width + 24;
    ctx.fillRect(VIEW_W / 2 - w / 2, 14, w, 26);
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillText(obj, VIEW_W / 2, 32);
  }

  // ---------- mission banner
  const B = game.missions.banner;
  if (B) {
    const a = clamp(B.t > 0.7 ? 1 : B.t / 0.7, 0, 1);
    ctx.globalAlpha = a;
    shadowText(ctx, B.txt, VIEW_W / 2, VIEW_H * 0.34, 44, B.col, 'center');
    if (B.sub) shadowText(ctx, B.sub, VIEW_W / 2, VIEW_H * 0.34 + 34, 18, '#ffffff', 'center');
    ctx.globalAlpha = 1;
  }

  // ---------- subtitles (bottom-center)
  if (game.sub && game.sub.t > 0) {
    ctx.font = '16px "Segoe UI", system-ui, sans-serif';
    const lines = wrap(ctx, game.sub.txt, 620);
    let y = VIEW_H - 70 - (lines.length - 1) * 20;
    ctx.globalAlpha = clamp(game.sub.t, 0, 1);
    for (const ln of lines) {
      shadowText(ctx, ln, VIEW_W / 2, y, 16, '#ffe8b0', 'center', '');
      y += 20;
    }
    ctx.globalAlpha = 1;
  }

  // ---------- mute + hurt indicators
  if (game.audio.muted) {
    shadowText(ctx, 'MUTED (M)', VIEW_W - 26, VIEW_H - 12, 12, 'rgba(255,255,255,0.45)', 'right', '');
  }
  if (p.hurtT > 0) {
    ctx.fillStyle = 'rgba(255,30,50,' + (p.hurtT * 0.7).toFixed(3) + ')';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  }
  if (p.hp < 30 && !p.dead) {
    const pulse = 0.12 + Math.sin(game.time * 5) * 0.07;
    ctx.fillStyle = 'rgba(255,20,40,' + pulse.toFixed(3) + ')';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  }

  // ---------- full map (hold Tab)
  if (game.input.down(KEYS.map)) drawMapOverlay(game, render);
}

const W_NAME = ['FISTS', 'PISTOL', 'SMG', 'SHOTGUN'];

/** Pause-free full-screen map with legend and run stats. */
function drawMapOverlay(game, render) {
  const ctx = render.ctx;
  if (!render.mmBase) render.buildMinimap(game);
  ctx.fillStyle = 'rgba(5,7,14,0.86)';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);

  const S = 640;           // on-screen size of the map square
  const ox = (VIEW_W - S) / 2 - 60;
  const oy = (VIEW_H - S) / 2;
  const k = S / 512;       // map texture scale
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(render.mmBase, ox, oy, S, S);
  ctx.imageSmoothingEnabled = true;
  ctx.strokeStyle = 'rgba(210,220,240,0.4)';
  ctx.strokeRect(ox + 0.5, oy + 0.5, S, S);

  const at = (wx, wy) => ({ x: ox + wx * (S / 6400), y: oy + wy * (S / 6400) });

  // blips
  const on = Math.floor(game.time * 5) % 2 === 0;
  for (const c of game.cars) {
    if (c.role === 'police' && !c.dead) {
      const p = at(c.x, c.y);
      ctx.fillStyle = on ? '#ff3040' : '#3050ff';
      ctx.fillRect(p.x - 3, p.y - 3, 6, 6);
    }
  }
  for (const m of game.markers) {
    const p = at(m.x, m.y);
    ctx.fillStyle = m.col;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 6, 0, 7);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.7)';
    ctx.stroke();
  }
  const pp = at(game.player.x, game.player.y);
  ctx.save();
  ctx.translate(pp.x, pp.y);
  ctx.rotate(game.player.h);
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(10, 0);
  ctx.lineTo(-7, -7);
  ctx.lineTo(-3, 0);
  ctx.lineTo(-7, 7);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // legend
  const lx = ox + S + 26;
  let ly = oy + 34;
  shadowText(ctx, 'VICE PALMS', lx, ly, 22, '#e8e8ee', 'left');
  ly += 30;
  const legend = [
    ['#ffd12d', 'R — Rico (story)'],
    ['#23e6ff', '! — objective'],
    ['#ff9f2d', 'W — Wrecking Crew'],
    ['#ffd12d', 'T — Vice Cab fares'],
    ['#a8ff2d', 'G — Ammu-Nation'],
    ['#b06bff', 'S — Pay \'n\' Spray'],
    ['#ff4d6d', '☠ — Rampage'],
    [on ? '#ff3040' : '#3050ff', 'police'],
  ];
  for (const [col, txt] of legend) {
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.arc(lx + 6, ly - 4, 5, 0, 7);
    ctx.fill();
    shadowText(ctx, txt, lx + 20, ly, 14, 'rgba(255,255,255,0.8)', 'left', '');
    ly += 24;
  }
  // stats
  ly += 12;
  shadowText(ctx, 'STATS', lx, ly, 16, '#23e6ff', 'left');
  ly += 26;
  const st = game.stats;
  const rows = [
    ['Missions', String(st.missionsDone)],
    ['Story', game.missions.storyIdx + ' / 6'],
    ['Cash earned', fmtMoney(st.moneyEarned)],
    ['Cars wrecked', String(st.carsWrecked)],
    ['Distance', (st.distance / 500).toFixed(1) + ' km'],
  ];
  for (const [k2, v] of rows) {
    shadowText(ctx, k2, lx, ly, 13, 'rgba(255,255,255,0.55)', 'left', '');
    shadowText(ctx, v, lx + 150, ly, 13, '#e8e8ee', 'right');
    ly += 20;
  }
  shadowText(ctx, 'hold TAB', lx, oy + S + 8, 12, 'rgba(255,255,255,0.4)', 'left', '');
}

function bar(ctx, x, y, w, h, f, col, bg) {
  ctx.fillStyle = bg;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = col;
  ctx.fillRect(x, y, w * clamp(f, 0, 1), h);
  ctx.strokeStyle = 'rgba(0,0,0,0.6)';
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
}

function drawStar(ctx, cx, cy, r, col) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const rr = i % 2 === 0 ? r : r * 0.45;
    const a = -Math.PI / 2 + (i / 10) * Math.PI * 2;
    const x = Math.cos(a) * rr, y = Math.sin(a) * rr;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fillStyle = col;
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.55)';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();
}

function wrap(ctx, txt, maxW) {
  const words = String(txt).split(' ');
  const lines = [];
  let cur = '';
  for (const w of words) {
    const t = cur ? cur + ' ' + w : w;
    if (ctx.measureText(t).width > maxW && cur) {
      lines.push(cur);
      cur = w;
    } else cur = t;
  }
  if (cur) lines.push(cur);
  return lines;
}
