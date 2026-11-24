// hud.js — the cockpit layer: circular minimap, health/armor, stars, money,
// speedo, subtitles, mission text, timers. All drawn in screen space.

import { CFG } from './config.js';
import { G, clamp, fmtMoney, fmtTime } from './util.js';

export function drawHUD(c) {
  const P = G.player;
  if (!P) return;
  drawMinimap(c, P);
  drawStatus(c, P);
  drawSpeedo(c, P);
  drawCarHealth(c, P);
  drawTexts(c);
}

// ------------------------------------------------------------- minimap
function drawMinimap(c, P) {
  const cx = 112, cy = G.h - 112, R = 92;
  const w = G.world;
  if (!w || !w.mini) return;
  c.save();
  c.beginPath();
  c.arc(cx, cy, R, 0, Math.PI * 2);
  c.save();
  c.clip();

  // night base
  c.fillStyle = '#0a0c14';
  c.fillRect(cx - R, cy - R, R * 2, R * 2);

  const ms = w.miniScale;         // world→mini (0.1)
  const zoom = 1.9;               // extra zoom on the mini canvas
  const span = (R * 2) / (zoom * ms) * ms; // px of mini canvas shown
  const halfMini = R / (zoom * ms);
  const sx = P.x * ms - halfMini;
  const sy = P.y * ms - halfMini;
  const dw = R * 2, dh = R * 2;
  c.imageSmoothingEnabled = false;
  c.drawImage(w.mini, sx, sy, halfMini * 2, halfMini * 2, cx - R, cy - R, dw, dh);
  c.imageSmoothingEnabled = true;

  const toMap = (wx, wy) => ({
    x: cx + (wx - P.x) * ms * zoom,
    y: cy + (wy - P.y) * ms * zoom,
  });

  // police blips
  for (const car of G.cars) {
    if (car.type !== 'police' || car.dead) continue;
    const p = toMap(car.x, car.y);
    if (edgeClamp(p, cx, cy, R - 6)) continue;
    c.fillStyle = '#ff4055';
    c.beginPath(); c.arc(p.x, p.y, 3.4, 0, Math.PI * 2); c.fill();
  }
  for (const cop of G.cops) {
    if (cop.hp <= 0) continue;
    const p = toMap(cop.x, cop.y);
    if (edgeClamp(p, cx, cy, R - 6)) continue;
    c.fillStyle = '#4c7dff';
    c.fillRect(p.x - 2, p.y - 2, 4, 4);
  }
  // mission markers
  for (const mk of (G.missions ? G.missions.markers : [])) {
    const p = toMap(mk.x, mk.y);
    if (edgeClamp(p, cx, cy, R - 7)) continue;
    c.fillStyle = mk.color;
    c.beginPath(); c.arc(p.x, p.y, 4, 0, Math.PI * 2); c.fill();
    c.strokeStyle = 'rgba(0,0,0,0.7)';
    c.lineWidth = 1;
    c.stroke();
  }

  // player arrow
  c.save();
  c.translate(cx, cy);
  c.rotate(P.car ? P.car.h : P.h);
  c.fillStyle = '#ffffff';
  c.beginPath();
  c.moveTo(7, 0); c.lineTo(-5, -4.6); c.lineTo(-2.4, 0); c.lineTo(-5, 4.6);
  c.closePath();
  c.fill();
  c.restore();
  c.restore(); // clip

  // ring
  c.strokeStyle = 'rgba(255,210,240,0.5)';
  c.lineWidth = 3;
  c.beginPath(); c.arc(cx, cy, R + 1, 0, Math.PI * 2); c.stroke();
  c.strokeStyle = 'rgba(0,0,0,0.6)';
  c.lineWidth = 5;
  c.beginPath(); c.arc(cx, cy, R + 3, 0, Math.PI * 2); c.stroke();
  c.restore();
}

function edgeClamp(p, cx, cy, R) {
  const dx = p.x - cx, dy = p.y - cy;
  const d = Math.hypot(dx, dy);
  if (d <= R) return false;
  p.x = cx + (dx / d) * R;
  p.y = cy + (dy / d) * R;
  return true;
}

// ------------------------------------------------------------- status
function drawStatus(c, P) {
  // stars
  const stars = G.police ? G.police.stars : 0;
  c.font = '26px sans-serif';
  c.textAlign = 'right';
  for (let i = 0; i < 5; i++) {
    const x = G.w - 24 - (4 - i) * 30;
    const y = 40;
    if (i < stars) {
      const flash = stars >= 3 && Math.sin(G.t * 6) > 0;
      c.fillStyle = flash ? '#ffffff' : '#ffd24a';
      c.fillText('\u2605', x, y);
    } else {
      c.fillStyle = 'rgba(255,255,255,0.16)';
      c.fillText('\u2606', x, y);
    }
  }
  // money
  c.font = 'bold 22px "Consolas", monospace';
  c.fillStyle = '#7cffa0';
  c.fillText(fmtMoney(G.money), G.w - 24, 74);

  // health + armor bars
  const bw = 190, bx = G.w - 24 - bw, by = 92;
  c.fillStyle = 'rgba(0,0,0,0.55)';
  c.fillRect(bx - 3, by - 3, bw + 6, 34);
  c.fillStyle = 'rgba(255,255,255,0.12)';
  c.fillRect(bx, by, bw, 12);
  c.fillStyle = P.hp < 30 ? (Math.sin(G.t * 8) > 0 ? '#ff4055' : '#a01828') : '#ff5c8f';
  c.fillRect(bx, by, bw * clamp(P.hp / CFG.P_HP, 0, 1), 12);
  c.fillStyle = 'rgba(255,255,255,0.12)';
  c.fillRect(bx, by + 16, bw, 10);
  if (P.armor > 0 || true) {
    c.fillStyle = '#4c7dff';
    c.fillRect(bx, by + 16, bw * clamp(P.armor / 100, 0, 1), 10);
  }
  c.font = '11px sans-serif';
  c.fillStyle = 'rgba(255,255,255,0.6)';
  c.textAlign = 'left';
  c.fillText('HEALTH', bx + 4, by + 10);
  c.fillText('ARMOR', bx + 4, by + 24);

  // ammo + weapon
  c.font = 'bold 15px "Consolas", monospace';
  c.textAlign = 'right';
  c.fillStyle = P.reloadT > 0 ? '#ffd24a' : '#e8e6e3';
  const wbox = P.weapons[P.weapon];
  const wname = CFG.WEAPONS[P.weapon].name;
  const ammoTxt = P.reloadT > 0 ? 'RELOADING' : (wbox.mag + ' / ' + wbox.reserve);
  const wtag = P.hasShotgun ? '  [Q ' + CFG.WEAPONS[P.weapon].name + ']' : '';
  c.fillText('\u{1F52B} ' + wname + ' ' + ammoTxt + wtag, G.w - 24, by + 48);
}

// car condition bar while driving
function drawCarHealth(c, P) {
  if (!P.car || P.car.dead) return;
  const frac = clamp(P.car.hp / P.car.maxHp, 0, 1);
  const bw = 190, bx = G.w - 24 - bw, by = 150;
  c.fillStyle = 'rgba(0,0,0,0.55)';
  c.fillRect(bx - 3, by - 3, bw + 6, 18);
  c.fillStyle = 'rgba(255,255,255,0.12)';
  c.fillRect(bx, by, bw, 12);
  c.fillStyle = frac < 0.25 ? (Math.sin(G.t * 8) > 0 ? '#ff4055' : '#7a1410') : '#ffb200';
  c.fillRect(bx, by, bw * frac, 12);
  c.font = '10px sans-serif';
  c.fillStyle = 'rgba(255,255,255,0.6)';
  c.textAlign = 'left';
  c.fillText(P.car.spec.name.toUpperCase() + (P.car.spikeT > 0 ? ' — FLAT TIRES' : ''), bx + 4, by + 9);
  // nitro gauge under the condition bar
  const nf = P.car.nitro;
  c.fillStyle = 'rgba(0,0,0,0.55)';
  c.fillRect(bx - 3, by + 19, bw + 6, 10);
  c.fillStyle = 'rgba(255,255,255,0.10)';
  c.fillRect(bx, by + 21, bw, 6);
  c.fillStyle = P.car.nitroOn ? '#7cffa0' : 'rgba(124,255,160,0.55)';
  c.fillRect(bx, by + 21, bw * nf, 6);
  c.font = '9px sans-serif';
  c.fillStyle = 'rgba(255,255,255,0.5)';
  c.fillText('NITRO — drift to refill, SHIFT to burn', bx + 4, by + 27);
}

// ------------------------------------------------------------- speedo
function drawSpeedo(c, P) {
  if (!P.car) return;
  const kmh = Math.round(Math.abs(P.car.speed) * 0.42);
  const cx = G.w - 92, cy = G.h - 84, R = 52;
  c.fillStyle = 'rgba(6,4,15,0.72)';
  c.beginPath(); c.arc(cx, cy, R + 10, 0, Math.PI * 2); c.fill();
  c.strokeStyle = 'rgba(255,92,143,0.5)';
  c.lineWidth = 3;
  c.beginPath(); c.arc(cx, cy, R + 10, 0, Math.PI * 2); c.stroke();
  // arc gauge
  const frac = clamp(Math.abs(P.car.speed) / P.car.spec.max, 0, 1);
  c.strokeStyle = frac > 0.85 ? '#ff4055' : '#00e5ff';
  c.lineWidth = 6;
  c.beginPath();
  c.arc(cx, cy, R, Math.PI * 0.75, Math.PI * 0.75 + Math.PI * 1.5 * frac);
  c.stroke();
  // ticks
  c.strokeStyle = 'rgba(255,255,255,0.25)';
  c.lineWidth = 2;
  c.beginPath();
  for (let k = 0; k <= 6; k++) {
    const a = Math.PI * 0.75 + Math.PI * 1.5 * (k / 6);
    c.moveTo(cx + Math.cos(a) * (R - 8), cy + Math.sin(a) * (R - 8));
    c.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R);
  }
  c.stroke();
  c.font = 'bold 24px "Consolas", monospace';
  c.textAlign = 'center';
  c.fillStyle = '#ffffff';
  c.fillText(String(kmh), cx, cy + 4);
  c.font = '10px sans-serif';
  c.fillStyle = 'rgba(255,255,255,0.55)';
  c.fillText('KM/H', cx, cy + 18);
  c.textAlign = 'left';
}

// ------------------------------------------------------------- texts
function drawTexts(c) {
  const hud = G.hud;
  // mission text
  if (hud.missionT > 0) {
    c.font = 'bold 17px sans-serif';
    c.textAlign = 'center';
    c.fillStyle = 'rgba(0,0,0,0.5)';
    const wid = c.measureText(hud.mission).width + 28;
    c.fillRect(G.w / 2 - wid / 2, 18, wid, 30);
    c.fillStyle = '#ffd24a';
    c.fillText(hud.mission, G.w / 2, 39);
  }
  // mission-passed banner
  if (hud.passed > 0) {
    const k = clamp(hud.passed / 3.4, 0, 1);
    c.textAlign = 'center';
    c.fillStyle = `rgba(0,0,0,${0.55 * k})`;
    c.fillRect(0, G.h * 0.32, G.w, 110);
    c.font = 'bold 46px "Arial Black", sans-serif';
    c.fillStyle = '#7cffa0';
    c.fillText('MISSION PASSED!', G.w / 2, G.h * 0.32 + 52);
    c.font = 'bold 18px sans-serif';
    c.fillStyle = '#ffffff';
    c.fillText(hud.passedName, G.w / 2, G.h * 0.32 + 84);
  }
  // help line
  if (hud.help > 0) {
    c.font = '14px sans-serif';
    c.textAlign = 'center';
    c.fillStyle = 'rgba(0,0,0,0.45)';
    const wid = c.measureText(hud.helpText).width + 24;
    c.fillRect(G.w / 2 - wid / 2, G.h - 172, wid, 24);
    c.fillStyle = 'rgba(255,255,255,0.85)';
    c.fillText(hud.helpText, G.w / 2, G.h - 155);
  }
  // subtitles
  if (hud.subT > 0 && hud.sub) {
    c.font = '16px sans-serif';
    c.textAlign = 'center';
    const wid = Math.min(G.w - 80, c.measureText(hud.sub).width + 40);
    c.fillStyle = 'rgba(0,0,0,0.62)';
    c.fillRect(G.w / 2 - wid / 2, G.h - 66, wid, 36);
    // speaker color
    let body = hud.sub;
    c.fillStyle = '#ffd9f2';
    if (body.startsWith('RICO:')) {
      c.fillStyle = '#ffb200';
    } else if (body.startsWith('DISPATCH:') || body.startsWith('SEAL:') || body.startsWith('FOREMAN:')) {
      c.fillStyle = '#7cffa0';
    }
    c.fillText(body, G.w / 2, G.h - 43);
  }
  // mission checklist under the top text
  const prog = G.missions ? G.missions.progress() : null;
  if (prog && G.state === 'playing') {
    c.font = '13px "Consolas", monospace';
    c.textAlign = 'center';
    c.fillStyle = 'rgba(0,0,0,0.45)';
    const wid = Math.max(c.measureText(prog[0]).width, c.measureText(prog[1]).width) + 24;
    c.fillRect(G.w / 2 - wid / 2, 52, wid, 38);
    c.fillStyle = 'rgba(232,230,227,0.8)';
    c.fillText(prog[0], G.w / 2, 68);
    c.fillStyle = '#7cffa0';
    c.fillText(prog[1], G.w / 2, 84);
  }
  // mute notice
  if (G.muted) {
    c.font = '11px sans-serif';
    c.textAlign = 'right';
    c.fillStyle = 'rgba(255,255,255,0.4)';
    c.fillText('SOUND OFF (M)', G.w - 12, G.h - 12);
  }
  // wanted decay progress
  if (G.police && G.police.stars > 0 && G.police.decayT > 2) {
    const frac = clamp(G.police.decayT / CFG.STAR_DECAY_T, 0, 1);
    c.fillStyle = 'rgba(76,125,255,0.7)';
    c.fillRect(G.w / 2 - 70, 56, 140 * frac, 4);
  }
  drawShopMenu(c);
  drawRadio(c);
  c.textAlign = 'left';
}

// Ammu-Nation counter menu
function drawShopMenu(c) {
  const open = G.shops && G.shops.open;
  if (!open) return;
  const w = 320, h = 150;
  const x = G.w / 2 - w / 2, y = G.h / 2 - h - 60;
  c.fillStyle = 'rgba(6,4,15,0.92)';
  c.fillRect(x, y, w, h);
  c.strokeStyle = '#ff5040';
  c.lineWidth = 2;
  c.strokeRect(x, y, w, h);
  c.font = 'bold 20px "Arial Black", sans-serif';
  c.fillStyle = '#ff5040';
  c.textAlign = 'center';
  c.fillText(open.name, G.w / 2, y + 30);
  c.font = '15px "Consolas", monospace';
  c.fillStyle = '#e8e6e3';
  c.fillText('[1]  9mm box (17)  ·  $60', G.w / 2, y + 66);
  c.fillText('[2]  body armor   ·  $250', G.w / 2, y + 92);
  c.fillStyle = 'rgba(255,255,255,0.55)';
  c.font = '12px sans-serif';
  c.fillText('E / Esc — put it back on the shelf', G.w / 2, y + 126);
}

// radio station banner + weather readout
function drawRadio(c) {
  let ly = 130;
  if (G.radioName) {
    c.font = 'bold 13px "Consolas", monospace';
    c.textAlign = 'center';
    c.fillStyle = 'rgba(255,47,125,0.85)';
    c.fillText('\u266A ' + G.radioName + ' \u266A', G.w / 2, ly);
    ly += 20;
  }
  if (G.weather && G.weather.rain > 0.05) {
    c.font = '12px sans-serif';
    c.textAlign = 'center';
    c.fillStyle = 'rgba(150,190,240,0.7)';
    const label = G.weather.rain > 0.5 ? '\u26C7 squall over the water' : '\u26C6 light rain';
    c.fillText(label + '  ·  roads ' + Math.round(G.weather.wet * 100) + '% wet', G.w / 2, ly);
  }
}
