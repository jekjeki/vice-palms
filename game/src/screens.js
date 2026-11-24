// Vice Palms — screens: title menu, pause, WASTED / BUSTED.

import { VIEW_W, VIEW_H, COLORS, SAVE_KEY } from './config.js';
import { shadowText, clamp } from './util.js';

export function makeScreens() {
  return { mode: 'title', sel: 0, t: 0, delArm: 0 };
}

const TITLE_MENU = ['NEW GAME', 'CONTINUE', 'DELETE SAVE'];
const PAUSE_MENU = ['RESUME', 'SAVE GAME', 'QUIT TO TITLE'];

export function updateScreens(game, dt) {
  const S = game.screens;
  const inp = game.input;
  S.t += dt;
  if (S.delArm > 0) S.delArm -= dt;

  if (S.mode === 'title') {
    const hasSave = !!game.loadRaw();
    if (inp.pressed(['ArrowUp', 'KeyW'])) S.sel = (S.sel + 2) % 3;
    if (inp.pressed(['ArrowDown', 'KeyS'])) S.sel = (S.sel + 1) % 3;
    if (inp.pressed(['Enter', 'Space'])) {
      if (S.sel === 0) {
        game.newGame();
        S.mode = 'playing';
        game.subtitle('Vice Palms, 1986. Rico is waiting at the safehouse.', 5);
      } else if (S.sel === 1 && hasSave) {
        if (game.continueGame()) {
          S.mode = 'playing';
          game.subtitle('Welcome back to Vice Palms.', 3);
        }
      } else if (S.sel === 2) {
        if (S.delArm > 0) {
          game.deleteSave();
          S.delArm = 0;
        } else {
          S.delArm = 3;
        }
      }
    }
    return;
  }

  if (S.mode === 'playing') {
    if (inp.pressed(['Escape', 'KeyP'])) {
      S.mode = 'paused';
      S.sel = 0;
      game.audio.engine(false, 0);
    }
    return;
  }

  if (S.mode === 'paused') {
    if (inp.pressed(['ArrowUp', 'KeyW'])) S.sel = (S.sel + PAUSE_MENU.length - 1) % PAUSE_MENU.length;
    if (inp.pressed(['ArrowDown', 'KeyS'])) S.sel = (S.sel + 1) % PAUSE_MENU.length;
    if (inp.pressed(['Escape', 'KeyP'])) S.mode = 'playing';
    if (inp.pressed(['Enter'])) {
      if (S.sel === 0) S.mode = 'playing';
      else if (S.sel === 1) {
        game.save();
        game.subtitle('Game saved.', 2.2);
      } else {
        game.audio.engine(false, 0);
        game.audio.siren(false);
        S.mode = 'title';
        S.sel = 0;
      }
    }
    return;
  }

  if (S.mode === 'wasted' || S.mode === 'busted') {
    if (S.t > 3.4) {
      game.respawn(S.mode);
      S.mode = 'playing';
    }
  }
}

export function drawScreens(game, render) {
  const ctx = render.ctx;
  const S = game.screens;
  ctx.setTransform(1, 0, 0, 1, 0, 0);

  if (S.mode === 'title') {
    ctx.fillStyle = 'rgba(5,7,14,0.72)';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);

    // palm silhouettes
    drawPalm(ctx, 150, VIEW_H - 60, 1.4, game.time);
    drawPalm(ctx, VIEW_W - 140, VIEW_H - 40, 1.1, game.time + 2);

    // logo
    ctx.save();
    ctx.translate(VIEW_W / 2, VIEW_H * 0.30);
    ctx.transform(1, 0, -0.12, 1, 0, 0); // italic slant
    ctx.textAlign = 'center';
    ctx.font = 'bold 92px "Segoe UI", system-ui, sans-serif';
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillText('VICE', 4, 4);
    const g1 = ctx.createLinearGradient(0, -80, 0, 20);
    g1.addColorStop(0, '#9df2ff');
    g1.addColorStop(1, '#23e6ff');
    ctx.fillStyle = g1;
    ctx.fillText('VICE', 0, 0);
    ctx.font = 'bold 92px Georgia, serif';
    const g2 = ctx.createLinearGradient(0, 10, 0, 110);
    g2.addColorStop(0, '#ff7ab0');
    g2.addColorStop(1, '#ff2d78');
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillText('PALMS', 4, 104);
    ctx.fillStyle = g2;
    ctx.fillText('PALMS', 0, 100);
    ctx.restore();

    shadowText(ctx, 'A NEON CITY CRIME STORY — MAKE.FUN GT A6-01 BUILD', VIEW_W / 2, VIEW_H * 0.30 + 132, 15, 'rgba(255,255,255,0.55)', 'center', '');

    // menu
    const hasSave = !!game.loadRaw();
    const items = TITLE_MENU;
    for (let i = 0; i < items.length; i++) {
      const y = VIEW_H * 0.60 + i * 38;
      const sel = S.sel === i;
      const dim = (i === 1 && !hasSave);
      let txt = items[i];
      if (i === 2 && S.delArm > 0) txt = 'REALLY DELETE? (ENTER AGAIN)';
      if (i === 1 && !hasSave) txt = 'CONTINUE (no save)';
      shadowText(ctx, (sel ? '▸ ' : '') + txt, VIEW_W / 2, y, sel ? 24 : 20, dim ? 'rgba(255,255,255,0.3)' : (sel ? '#ffd12d' : '#e8e8ee'), 'center');
    }
    if (Math.floor(game.time * 1.6) % 2 === 0) {
      shadowText(ctx, 'PRESS ENTER', VIEW_W / 2, VIEW_H - 84, 18, '#23e6ff', 'center');
    }
    shadowText(ctx, 'WASD drive/walk · F enter/steal car · SPACE shoot/handbrake · Q weapon · SHIFT sprint · M mute',
      VIEW_W / 2, VIEW_H - 34, 13, 'rgba(255,255,255,0.45)', 'center', '');
    return;
  }

  if (S.mode === 'paused') {
    ctx.fillStyle = 'rgba(5,7,14,0.66)';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    shadowText(ctx, 'PAUSED', VIEW_W / 2, VIEW_H * 0.34, 52, '#e8e8ee', 'center');
    for (let i = 0; i < PAUSE_MENU.length; i++) {
      const y = VIEW_H * 0.52 + i * 38;
      const sel = S.sel === i;
      shadowText(ctx, (sel ? '▸ ' : '') + PAUSE_MENU[i], VIEW_W / 2, y, sel ? 24 : 20, sel ? '#ffd12d' : '#e8e8ee', 'center');
    }
    shadowText(ctx, 'M mute · the city waits for no one', VIEW_W / 2, VIEW_H - 40, 13, 'rgba(255,255,255,0.4)', 'center', '');
    return;
  }

  if (S.mode === 'wasted' || S.mode === 'busted') {
    const a = clamp(S.t * 1.6, 0, 0.86);
    ctx.fillStyle = S.mode === 'wasted' ? 'rgba(30,4,10,' + a + ')' : 'rgba(6,10,30,' + a + ')';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.save();
    ctx.translate(VIEW_W / 2, VIEW_H * 0.44);
    ctx.transform(1, 0, -0.1, 1, 0, 0);
    ctx.textAlign = 'center';
    ctx.font = 'bold 84px Georgia, serif';
    ctx.fillStyle = 'rgba(0,0,0,0.8)';
    ctx.fillText(S.mode.toUpperCase(), 5, 5);
    ctx.fillStyle = S.mode === 'wasted' ? '#ff4d6d' : '#4d9fff';
    ctx.fillText(S.mode.toUpperCase(), 0, 0);
    ctx.restore();
    const fee = S.mode === 'wasted' ? 300 : 200;
    shadowText(ctx, 'Hospital bills cost $' + fee, VIEW_W / 2, VIEW_H * 0.44 + 52, 18, 'rgba(255,255,255,0.75)', 'center');
  }
}

function drawPalm(ctx, x, y, s, t) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  ctx.fillStyle = 'rgba(8,10,18,0.9)';
  // trunk
  ctx.beginPath();
  ctx.moveTo(-4, 0);
  ctx.quadraticCurveTo(2, -60, 10, -110);
  ctx.lineTo(16, -108);
  ctx.quadraticCurveTo(8, -58, 5, 0);
  ctx.closePath();
  ctx.fill();
  // fronds
  for (let k = 0; k < 7; k++) {
    const a = -Math.PI / 2 - Math.PI * 0.5 + (k / 6) * Math.PI * 1.0;
    const sway = Math.sin(t * 0.8 + k) * 0.04;
    ctx.save();
    ctx.translate(13, -110);
    ctx.rotate(a + sway);
    ctx.beginPath();
    ctx.ellipse(34, 0, 36, 7, 0, 0, 7);
    ctx.fill();
    ctx.restore();
  }
  ctx.restore();
}
