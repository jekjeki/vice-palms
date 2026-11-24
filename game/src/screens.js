// screens.js — title, pause, wasted/busted, mission-passed, end credits.
// Also owns localStorage save / continue / delete.

import { CFG } from './config.js';
import { G, clamp } from './util.js';
import { hit, onAnyKey } from './input.js';
import { startMusic, stopMusic, initAudio, resumeAudio, setMuted } from './audio.js';
import { drawStats } from './stats.js';

const menu = { titleSel: 0, pauseSel: 0 };
let keyReady = false;

export function initScreens() {
  // audio needs a gesture; any key or click will do (muted builds skip it)
  onAnyKey(() => {
    if (keyReady) return;
    keyReady = true;
    if (!G.muted) { initAudio(); resumeAudio(); startMusic(); }
  });
}

export function hasSave() {
  try { return !!localStorage.getItem(CFG.SAVE_KEY); } catch { return false; }
}

export function saveGame() {
  try {
    const P = G.player;
    const data = {
      money: G.money,
      storyIdx: G.missions ? G.missions.storyIdx : 0,
      sideDone: G.missions ? G.missions.sideDone : [false, false, false, false, false],
      x: P ? P.x : 0, y: P ? P.y : 0,
      hp: P ? P.hp : 100, armor: P ? P.armor : 0,
      weapon: P ? P.weapon : 'pistol',
      hasShotgun: P ? P.hasShotgun : false,
      pistolMag: P ? P.weapons.pistol.mag : 17,
      pistolRes: P ? P.weapons.pistol.reserve : 51,
      sgMag: P ? P.weapons.shotgun.mag : 0,
      sgRes: P ? P.weapons.shotgun.reserve : 0,
      garage: G.garageData || null,
      seed: G.seed,
      t: G.t,
    };
    localStorage.setItem(CFG.SAVE_KEY, JSON.stringify(data));
    return true;
  } catch { return false; }
}

export function loadSave() {
  try {
    const raw = localStorage.getItem(CFG.SAVE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export function deleteSave() {
  try { localStorage.removeItem(CFG.SAVE_KEY); } catch {}
}

// ---------------------------------------------------------------- updates
export function updateScreens(game) {
  const st = G.state;
  if (st === 'title') {
    const n = titleItems().length;
    if (hit('ArrowUp') || hit('KeyW')) menu.titleSel = (menu.titleSel + n - 1) % n;
    if (hit('ArrowDown') || hit('KeyS')) menu.titleSel = (menu.titleSel + 1) % n;
    if (hit('Enter') || hit('Space') || hit('NumpadEnter')) {
      const items = titleItems();
      const act = items[menu.titleSel];
      if (act === 'NEW GAME') game.newGame(null);
      else if (act === 'CONTINUE') game.continueGame();
      else if (act === 'DELETE SAVE') { deleteSave(); menu.titleSel = 0; }
    }
    if (hit('KeyM')) setMuted(!G.muted);
  } else if (st === 'paused') {
    if (hit('Escape')) { game.setState('playing'); return; }
    if (hit('KeyM')) setMuted(!G.muted);
    if (hit('ArrowUp') || hit('KeyW')) menu.pauseSel = (menu.pauseSel + 2) % 3;
    if (hit('ArrowDown') || hit('KeyS')) menu.pauseSel = (menu.pauseSel + 1) % 3;
    if (hit('Enter') || hit('NumpadEnter')) {
      if (menu.pauseSel === 0) game.setState('playing');
      else if (menu.pauseSel === 1) { saveGame(); game.setState('playing'); }
      else { stopMusic(); game.toTitle(); }
    }
  } else if (st === 'end') {
    if (hit('Enter') || hit('Escape')) { stopMusic(); game.toTitle(); }
  }
  // wasted / busted advance on their own timers inside game.js
}

function titleItems() {
  const items = ['NEW GAME'];
  if (hasSave()) items.push('CONTINUE');
  if (hasSave()) items.push('DELETE SAVE');
  return items;
}

// ---------------------------------------------------------------- drawing
export function drawScreens(c) {
  const st = G.state;
  if (st === 'title') drawTitle(c);
  else if (st === 'paused') drawPause(c);
  else if (st === 'wasted') drawWasted(c);
  else if (st === 'busted') drawBusted(c);
  else if (st === 'end') drawEnd(c);
  // mission-start title card rides on top of everything
  if (G.hud.cut) drawCutscene(c, G.hud.cut);
  // 'passed' banner lives in hud.js
}

function drawCutscene(c, cut) {
  const k = clamp(cut.t / 0.4, 0, 1) * clamp((3.2 - cut.t) / 0.4, 0, 1);
  const barH = 54 * k;
  c.fillStyle = 'rgba(2,0,8,0.9)';
  c.fillRect(0, 0, G.w, barH);
  c.fillRect(0, G.h - barH, G.w, barH);
  if (cut.t > 0.5) {
    const a = clamp((cut.t - 0.5) / 1.2, 0, 1);
    c.textAlign = 'center';
    c.font = 'bold 38px "Arial Black", sans-serif';
    c.fillStyle = `rgba(255,210,74,${a})`;
    c.fillText(cut.name.toUpperCase(), G.w / 2, G.h - barH - 46);
    c.font = '15px sans-serif';
    c.fillStyle = `rgba(232,230,227,${a * 0.85})`;
    c.fillText(cut.brief, G.w / 2, G.h - barH - 20);
    c.font = 'bold 11px "Consolas", monospace';
    c.fillStyle = `rgba(0,229,255,${a * 0.9})`;
    c.fillText(cut.isSide ? 'SIDE HUSTLE' : 'STORY JOB ' + (G.missions ? Math.min(6, G.missions.storyIdx + 1) : '') + '/6', G.w / 2, barH + 24);
    c.textAlign = 'left';
  }
}

function dim(c, a = 0.6) {
  c.fillStyle = `rgba(4,2,12,${a})`;
  c.fillRect(0, 0, G.w, G.h);
}

function drawTitle(c) {
  dim(c, 0.42);
  const t = G.t;
  // neon logo
  c.textAlign = 'center';
  const glow = 0.75 + 0.25 * Math.sin(t * 2.2);
  c.font = 'bold 86px "Arial Black", sans-serif';
  c.fillStyle = `rgba(255,47,125,${0.18 * glow})`;
  c.fillText('VICE PALMS', G.w / 2 + 4, 208 + 4);
  c.fillStyle = `rgba(0,229,255,${0.22 * glow})`;
  c.fillText('VICE PALMS', G.w / 2 - 3, 208 - 3);
  c.fillStyle = '#ffe9f4';
  c.fillText('VICE PALMS', G.w / 2, 208);
  c.font = 'bold 17px sans-serif';
  c.fillStyle = '#ffd24a';
  c.fillText('A  N E O N  N I G H T - C O A S T  S A N D B O X', G.w / 2, 244);

  // palms flanking
  for (const px of [190, G.w - 190]) {
    c.strokeStyle = '#2f7a44';
    c.lineWidth = 5;
    for (let a = 0; a < 7; a++) {
      const ang = (a / 7) * Math.PI * 2 + Math.sin(t * 1.4 + px) * 0.06;
      c.beginPath();
      c.moveTo(px, 300);
      c.quadraticCurveTo(px + Math.cos(ang) * 26, 300 + Math.sin(ang) * 26 - 12,
        px + Math.cos(ang) * 44, 300 + Math.sin(ang) * 44 - 6);
      c.stroke();
    }
    c.fillStyle = '#5a4028';
    c.fillRect(px - 4, 300, 8, 60);
  }

  // menu
  const items = titleItems();
  c.font = 'bold 24px "Consolas", monospace';
  items.forEach((it, i) => {
    const y = 420 + i * 44;
    const sel = i === menu.titleSel;
    if (sel) {
      c.fillStyle = 'rgba(255,47,125,0.22)';
      const wid = c.measureText(it).width + 60;
      c.fillRect(G.w / 2 - wid / 2, y - 27, wid, 36);
      c.fillStyle = '#ffd24a';
      c.fillText('\u25B8 ' + it + ' \u25C2', G.w / 2, y);
    } else {
      c.fillStyle = 'rgba(232,230,227,0.65)';
      c.fillText(it, G.w / 2, y);
    }
  });

  c.font = '13px sans-serif';
  c.fillStyle = 'rgba(255,255,255,0.55)';
  c.fillText('WASD drive/walk \u00b7 F enter/jack \u00b7 Space handbrake \u00b7 LMB shoot \u00b7 M sound', G.w / 2, G.h - 46);
  c.fillStyle = 'rgba(255,255,255,0.35)';
  c.fillText('seed ' + G.seed + ' \u00b7 make.fun gta6-01', G.w / 2, G.h - 26);
  // two-column control sheet, left side
  c.font = '12px "Consolas", monospace';
  c.textAlign = 'left';
  const colX = 60;
  let cy = G.h - 250;
  c.fillStyle = 'rgba(0,229,255,0.8)';
  c.fillText('ON FOOT', colX, cy); cy += 20;
  for (const line of ['WASD — walk', 'Shift — sprint', 'LMB / Ctrl — shoot', 'R — reload', 'Q — swap weapon', 'V — punch', 'F — take a car']) {
    c.fillStyle = 'rgba(232,230,227,0.55)';
    c.fillText(line, colX, cy); cy += 18;
  }
  // right column
  c.textAlign = 'right';
  const rx = G.w - 60;
  cy = G.h - 250;
  c.fillStyle = 'rgba(255,47,125,0.85)';
  c.fillText('BEHIND THE WHEEL', rx, cy); cy += 20;
  for (const line of ['WASD — drive', 'Space — handbrake', 'Shift — nitro (drift to refill)', 'LMB — drive-by', 'F — get out', 'H — horn', 'E — shops & garage']) {
    c.fillStyle = 'rgba(232,230,227,0.55)';
    c.fillText(line, rx, cy); cy += 18;
  }
  c.textAlign = 'center';
}

function drawPause(c) {
  dim(c, 0.55);
  c.textAlign = 'center';
  c.font = 'bold 54px "Arial Black", sans-serif';
  c.fillStyle = '#00e5ff';
  c.fillText('PAUSED', G.w / 2, 210);
  const items = ['RESUME', 'SAVE GAME', 'QUIT TO TITLE'];
  c.font = 'bold 22px "Consolas", monospace';
  items.forEach((it, i) => {
    const y = 290 + i * 44;
    if (i === menu.pauseSel) {
      c.fillStyle = 'rgba(0,229,255,0.18)';
      const wid = c.measureText(it).width + 60;
      c.fillRect(G.w / 2 - wid / 2, y - 25, wid, 34);
      c.fillStyle = '#ffd24a';
      c.fillText('\u25B8 ' + it + ' \u25C2', G.w / 2, y);
    } else {
      c.fillStyle = 'rgba(232,230,227,0.65)';
      c.fillText(it, G.w / 2, y);
    }
  });
  drawStats(c, G.w / 2 + 150, 190, 220);
  c.font = '12px sans-serif';
  c.fillStyle = 'rgba(255,255,255,0.4)';
  c.fillText('N — radio · H — horn · weather comes and goes', G.w / 2, G.h - 60);
  c.textAlign = 'left';
}

function drawWasted(c) {
  const k = clamp((G.wastedT || 0) / 2.6, 0, 1);
  c.fillStyle = `rgba(120,0,20,${0.4 * k})`;
  c.fillRect(0, 0, G.w, G.h);
  c.textAlign = 'center';
  c.font = 'bold 84px "Arial Black", sans-serif';
  c.fillStyle = '#ff4055';
  c.fillText('WASTED', G.w / 2, G.h / 2 + 10);
  c.font = '16px sans-serif';
  c.fillStyle = 'rgba(255,255,255,0.8)';
  c.fillText('The Paramedics of Vice Palms thank you for your donation.', G.w / 2, G.h / 2 + 52);
  c.textAlign = 'left';
}

function drawBusted(c) {
  const k = clamp((G.bustedT || 0) / 2.6, 0, 1);
  c.fillStyle = `rgba(10,20,120,${0.4 * k})`;
  c.fillRect(0, 0, G.w, G.h);
  c.textAlign = 'center';
  c.font = 'bold 84px "Arial Black", sans-serif';
  c.fillStyle = '#4c7dff';
  c.fillText('BUSTED', G.w / 2, G.h / 2 + 10);
  c.font = '16px sans-serif';
  c.fillStyle = 'rgba(255,255,255,0.8)';
  c.fillText('The VCPD impound also thanks you for your donation.', G.w / 2, G.h / 2 + 52);
  c.textAlign = 'left';
}

function drawEnd(c) {
  dim(c, 0.72);
  c.textAlign = 'center';
  c.font = 'bold 64px "Arial Black", sans-serif';
  c.fillStyle = '#ffd24a';
  c.fillText('THE PALMS REMEMBER', G.w / 2, 280);
  c.font = '19px sans-serif';
  c.fillStyle = '#e8e6e3';
  c.fillText('Rico Vargas is home. The neon hums. The tide keeps its schedule.', G.w / 2, 330);
  c.fillStyle = '#7cffa0';
  c.fillText('Six jobs, three favors, one city that never asks questions.', G.w / 2, 358);
  c.font = 'bold 20px "Consolas", monospace';
  c.fillStyle = '#ffd9f2';
  c.fillText('ENTER \u2014 keep cruising     \u00b7     credits roll forever tonight', G.w / 2, 430);
  c.font = '14px sans-serif';
  c.fillStyle = 'rgba(255,255,255,0.5)';
  c.fillText('final balance: $' + Math.floor(G.money).toLocaleString(), G.w / 2, 470);
  drawStats(c, G.w / 2 - 110, 520, 220, 'THE FINAL LEDGER');
  c.textAlign = 'left';
}
