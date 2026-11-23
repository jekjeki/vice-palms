// screens.js — title, pause, WASTED/BUSTED overlays, localStorage save/load.
import { S, VW, VH, clamp, dist } from './core.js';
import { render, drawBigMap } from './render.js';
import { drawHud, drawZoneCard, resetHelp } from './hud.js';
import { newGame } from './game.js';

const SAVE_KEY = 'vicepalms.save1';

export function hasSave() { try { return !!localStorage.getItem(SAVE_KEY); } catch { return false; } }

export function saveGame() {
  const p = S.player;
  if (!p) return false;
  const data = {
    v: 3, x: p.x, y: p.y, hp: p.hp, armor: p.armor, money: S.money, ammo: p.ammo,
    weapon: p.weapon, missionIndex: S.mission.index, kills: S.totalKills, t: Date.now(),
  };
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(data)); return true; } catch { return false; }
}

export function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return false;
    const d = JSON.parse(raw);
    const p = S.player;
    p.x = d.x; p.y = d.y; p.hp = d.hp; p.armor = d.armor ?? 0;
    p.ammo = d.ammo ?? 40; p.weapon = d.weapon === 'pistol' && p.ammo > 0 ? 'pistol' : 'fist';
    p.inCar = null; p.dead = false;
    S.money = d.money ?? 0; S.moneyShow = S.money;
    S.totalKills = d.kills ?? 0;
    S.mission.index = clamp(d.missionIndex ?? 0, 0, 6);
    S.wanted = 0; S.seenT = 0; S.bustT = 0;
    return true;
  } catch { return false; }
}

export function deleteSave() { try { localStorage.removeItem(SAVE_KEY); } catch {} }

// ---------------------------------------------------------------- title
let menuSel = 0;
export const TITLE_ITEMS = () => ['New Game', ...(hasSave() ? ['Continue', 'Delete Save'] : []), 'How to Play'];

export function titleUpdate(dt, input) {
  S.demo += dt;
  // slow cinematic pan along Ocean Drive
  S.cam.x = 2400 + Math.sin(S.demo * 0.11) * 1500;
  S.cam.y = 4020 + Math.cos(S.demo * 0.07) * 40;
  S.cam.zoom = 0.85;
  const items = TITLE_ITEMS();
  if (input.hit('ArrowUp', 'KeyW')) menuSel = (menuSel + items.length - 1) % items.length;
  if (input.hit('ArrowDown', 'KeyS')) menuSel = (menuSel + 1) % items.length;
  if (input.hit('Enter', 'Space', 'NumpadEnter')) pick(input);
  if (input.mclicked) {
    // click hit-test
    for (let i = 0; i < items.length; i++) {
      const r = itemRect(i, items.length);
      if (input.mx >= r.x && input.mx <= r.x + r.w && input.my >= r.y && input.my <= r.y + r.h) { menuSel = i; pick(input); break; }
    }
  }
}

function itemRect(i, n) {
  const w = 320, h = 44;
  return { x: VW / 2 - w / 2, y: VH / 2 + 58 + i * 54, w, h };
}

function pick(input) {
  const items = TITLE_ITEMS();
  const what = items[menuSel];
  if (what === 'New Game') newGame();
  else if (what === 'Continue') { newGame(true); loadGame(); }
  else if (what === 'Delete Save') { deleteSave(); menuSel = 0; }
  else if (what === 'How to Play') { S.toasts.push({ text: 'WASD move · F carjack · LMB shoot · SPACE handbrake · 1/2 weapons', t: 0, dur: 6 }); }
}

export function drawTitle(ctx) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  // dim the world behind
  ctx.fillStyle = 'rgba(6,7,20,0.62)';
  ctx.fillRect(0, 0, VW, VH);
  ctx.textAlign = 'center';
  // neon logo
  const t = S.time;
  ctx.font = 'bold 88px Arial Black, Arial';
  const glow = 0.75 + Math.sin(t * 2) * 0.15;
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.fillText('VICE PALMS', VW / 2 + 5, 195 + 5);
  ctx.shadowColor = '#ff3fd4'; ctx.shadowBlur = 42 * glow;
  ctx.fillStyle = '#ff9be8';
  ctx.fillText('VICE PALMS', VW / 2, 195);
  ctx.shadowColor = '#00e5ff'; ctx.shadowBlur = 30;
  ctx.fillStyle = '#a9f4ff';
  ctx.font = 'bold 24px Arial Black, Arial';
  ctx.fillText('—  W E L C O M E   T O   T H E   G R I N D  —', VW / 2, 238);
  ctx.shadowBlur = 0;
  ctx.font = '14px Arial';
  ctx.fillStyle = '#9aa4b8';
  ctx.fillText('a make.fun gta6-01 bounty entry · vanilla JS · no libraries', VW / 2, 268);
  // menu
  const items = TITLE_ITEMS();
  ctx.font = 'bold 24px Arial Black, Arial';
  items.forEach((it, i) => {
    const r = itemRect(i, items.length);
    const sel = i === menuSel;
    ctx.fillStyle = sel ? 'rgba(255,63,212,0.16)' : 'rgba(10,12,26,0.66)';
    roundRect(ctx, r.x, r.y, r.w, r.h, 10); ctx.fill();
    if (sel) { ctx.strokeStyle = '#ff3fd4'; ctx.lineWidth = 2; roundRect(ctx, r.x, r.y, r.w, r.h, 10); ctx.stroke(); }
    ctx.fillStyle = sel ? '#ffd9f6' : '#b9c2d4';
    ctx.fillText(it, VW / 2, r.y + 30);
  });
  ctx.font = '13px Arial';
  ctx.fillStyle = '#8a93a8';
  ctx.fillText('↑/↓ + ENTER · or click', VW / 2, VH - 28);
  ctx.textAlign = 'left';
  ctx.shadowBlur = 0;
}

// ---------------------------------------------------------------- pause
let pauseSel = 0;
let lastToggle = -9;
const PAUSE_ITEMS = ['Resume', 'Save Game', 'Load Game', 'Quit to Title'];

export function pauseToggle() {
  if (S.time - lastToggle < 0.3) return; // ignore same-frame re-triggers from multi-step ticks
  lastToggle = S.time;
  S.mode = S.mode === 'paused' ? 'playing' : 'paused';
  pauseSel = 0;
}

export function pauseUpdate(dt, input) {
  if (input.hit('Escape', 'KeyP')) { pauseToggle(); return; }
  if (input.hit('ArrowUp', 'KeyW')) pauseSel = (pauseSel + PAUSE_ITEMS.length - 1) % PAUSE_ITEMS.length;
  if (input.hit('ArrowDown', 'KeyS')) pauseSel = (pauseSel + 1) % PAUSE_ITEMS.length;
  if (input.hit('Enter', 'Space', 'NumpadEnter')) pickPause();
  if (input.mclicked) {
    for (let i = 0; i < PAUSE_ITEMS.length; i++) {
      const r = itemRect(i, PAUSE_ITEMS.length);
      if (input.mx >= r.x && input.mx <= r.x + r.w && input.my >= r.y && input.my <= r.y + r.h) { pauseSel = i; pickPause(); break; }
    }
  }
}

function pickPause() {
  const what = PAUSE_ITEMS[pauseSel];
  if (what === 'Resume') S.mode = 'playing';
  else if (what === 'Save Game') { const ok = saveGame(); S.toasts.push({ text: ok ? 'Game saved.' : 'Save failed.', t: 0, dur: 2.5 }); }
  else if (what === 'Load Game') { const ok = loadGame(); S.toasts.push({ text: ok ? 'Game loaded.' : 'No save found.', t: 0, dur: 2.5 }); if (ok) S.mode = 'playing'; }
  else if (what === 'Quit to Title') { S.mode = 'title'; S.demo = 0; }
}

export function drawPause(ctx) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = 'rgba(4,5,14,0.66)';
  ctx.fillRect(0, 0, VW, VH);
  ctx.textAlign = 'center';
  ctx.font = 'bold 52px Arial Black, Arial';
  ctx.fillStyle = '#a9f4ff';
  ctx.fillText('PAUSED', VW / 2, 170);
  ctx.font = 'bold 22px Arial Black, Arial';
  PAUSE_ITEMS.forEach((it, i) => {
    const r = itemRect(i, PAUSE_ITEMS.length);
    const sel = i === pauseSel;
    ctx.fillStyle = sel ? 'rgba(0,229,255,0.14)' : 'rgba(10,12,26,0.66)';
    roundRect(ctx, r.x, r.y, r.w, r.h, 10); ctx.fill();
    if (sel) { ctx.strokeStyle = '#00e5ff'; ctx.lineWidth = 2; roundRect(ctx, r.x, r.y, r.w, r.h, 10); ctx.stroke(); }
    ctx.fillStyle = sel ? '#d9f6ff' : '#b9c2d4';
    ctx.fillText(it, VW / 2, r.y + 30);
  });
  ctx.textAlign = 'left';
}

// ---------------------------------------------------------------- wasted / busted
export function drawDead(ctx) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const t = S.modeT;
  const a = clamp(t / 0.8, 0, 1);
  ctx.fillStyle = S.mode === 'wasted' ? `rgba(40,0,0,${0.62 * a})` : `rgba(0,10,40,${0.62 * a})`;
  ctx.fillRect(0, 0, VW, VH);
  ctx.textAlign = 'center';
  ctx.font = 'bold 92px Arial Black, Arial';
  ctx.fillStyle = S.mode === 'wasted' ? `rgba(230,40,40,${a})` : `rgba(70,140,255,${a})`;
  ctx.fillText(S.mode === 'wasted' ? 'WASTED' : 'BUSTED', VW / 2, VH / 2 - 10);
  ctx.font = '18px Arial';
  ctx.fillStyle = `rgba(235,235,240,${a})`;
  const fee = S.mode === 'wasted' ? 100 : 150;
  ctx.fillText(S.mode === 'wasted' ? `Hospital bill: -$${fee}` : `Bail posted: -$${fee}`, VW / 2, VH / 2 + 34);
  ctx.fillText('Respawning...', VW / 2, VH / 2 + 66);
  ctx.textAlign = 'left';
}

// ---------------------------------------------------------------- big map
export function bigMapUpdate(dt, input) {
  if (input.hit('Tab', 'Escape')) S.bigMap = false;
}

export function toggleBigMap(on) { S.bigMap = on; }

// ---------------------------------------------------------------- helpers
export function endFrameCleanup() {
  // fade/kill transient overlays shared with game.js
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
