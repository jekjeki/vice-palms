// VICE PALMS — full-screen flow screens: title (with save handling), pause,
// WASTED, BUSTED and the ending.

import { CFG } from './config.js';
import { G, saveGame, loadGame, deleteSave, checkSave, addMoney, bigMsg } from './state.js';
import { wasPressed, consumeAll } from './input.js';
import { play } from './audio.js';
import { STORY } from './missions.js';
import { fmtMoney } from './util.js';

const FONT = 'monospace';

let titleT = 0;
let menuIdx = 0;

export function updateScreens(dt) {
  titleT += dt;
  G.screenT += dt;

  switch (G.screen) {
    case 'title': updateTitle(); break;
    case 'play':
      if (wasPressed('pause')) { G.screen = 'pause'; G.screenT = 0; menuIdx = 0; }
      break;
    case 'pause': updatePause(); break;
    case 'wasted':
      if (G.screenT > 2.6) { G.stats.missionsDone += 0; importRespawn('wasted'); }
      break;
    case 'busted':
      if (G.screenT > 2.6) importRespawn('busted');
      break;
    case 'end': updateEnd(); break;
  }
}

function importRespawn(kind) {
  // police.js respawn without an import cycle from screens
  G._respawn(kind);
}

function updateTitle() {
  const hasSave = G.hasSave;
  const entries = hasSave ? 3 : 2;
  if (wasPressed('down') || wasPressed('switch')) menuIdx = (menuIdx + 1) % entries;
  if (wasPressed('up')) menuIdx = (menuIdx - 1 + entries) % entries;
  if (wasPressed('enter') || wasPressed('attack')) {
    if (!hasSave) menuIdx = menuIdx === 0 ? 0 : 1;
    if (menuIdx === 0) {
      if (hasSave) loadGame();
      startGame();
    } else if (menuIdx === 1 && hasSave) {
      deleteSave();
      toastish('Save deleted');
    } else if ((menuIdx === 1 && !hasSave) || (menuIdx === 2 && hasSave)) {
      // new game
      G.player.money = CFG.START_MONEY;
      G.player.hp = CFG.P_HP;
      G.player.restored = false;
      G.missionIdx = 0;
      G.done = false;
      startGame();
    }
  }
}

function toastish(msg) { G.toasts.push({ msg, t: 2, max: 2 }); }

function startGame() {
  G.screen = 'play';
  G.screenT = 0;
  menuIdx = 0;
  const p = G.player;
  p.dead = false;
  p.car = null;
  p.stars = 0;
  if (!G.player.restored) {
    p.x = G.world.poi.playerStart.x;
    p.y = G.world.poi.playerStart.y;
  }
  G.cam.x = p.x; G.cam.y = p.y;
  bigMsg('VICE PALMS', 'Welcome back to the strip', '#3ae7ff', 3);
  play('mission');
}

function updatePause() {
  const entries = 4;
  if (wasPressed('down')) menuIdx = (menuIdx + 1) % entries;
  if (wasPressed('up')) menuIdx = (menuIdx - 1 + entries) % entries;
  if (wasPressed('pause')) { G.screen = 'play'; return; }
  if (wasPressed('enter')) {
    if (menuIdx === 0) { G.screen = 'play'; }
    else if (menuIdx === 1) {
      saveGame();
      toastish('Saved to this browser');
      G.screen = 'play';
    } else if (menuIdx === 2) {
      deleteSave();
      toastish('Save deleted');
    } else {
      G.screen = 'title';
      titleT = 0;
      checkSave();
    }
  }
}

function updateEnd() {
  if (wasPressed('enter')) {
    G.screen = 'play';
    G.screenT = 0;
  }
}

// ---------------------------------------------------------------------------
// drawing

export function drawScreens(ctx) {
  switch (G.screen) {
    case 'title': drawTitle(ctx); break;
    case 'pause': drawPause(ctx); break;
    case 'wasted': drawWastedBusted(ctx, 'WASTED', '#ff4f6e', 'The hospital keeps the change.'); break;
    case 'busted': drawWastedBusted(ctx, 'BUSTED', '#5ad0ff', 'The Vice Palms PD keeps the cash.'); break;
    case 'end': drawEnd(ctx); break;
  }
}

function neonTitle(ctx, text, x, y, size, col) {
  ctx.save();
  ctx.font = 'bold ' + size + 'px ' + FONT;
  ctx.textAlign = 'center';
  ctx.shadowColor = col;
  ctx.shadowBlur = 28;
  ctx.fillStyle = col;
  ctx.fillText(text, x, y);
  ctx.shadowBlur = 10;
  ctx.fillStyle = '#ffffff';
  ctx.globalAlpha = 0.25;
  ctx.fillText(text, x, y);
  ctx.restore();
}

function drawTitle(ctx) {
  dim(ctx, 0.55);
  neonTitle(ctx, 'VICE PALMS', G.W / 2, 190, 84, '#ff4fa3');
  neonTitle(ctx, 'A NEON-COASTAL CRIME STORY', G.W / 2, 240, 20, '#3ae7ff');

  const hasSave = G.hasSave;
  const entries = hasSave
    ? ['CONTINUE — ' + fmtMoney(G.player.money) + '  ·  STORY ' + Math.min(G.missionIdx + 1, STORY.length) + '/' + STORY.length,
       'DELETE SAVE', 'NEW GAME']
    : ['NEW GAME', 'JUST LOOK AROUND (no save)'];
  ctx.textAlign = 'center';
  for (let i = 0; i < entries.length; i++) {
    const y = 350 + i * 44;
    const sel = i === menuIdx;
    if (sel) {
      ctx.fillStyle = 'rgba(255,231,110,0.12)';
      ctx.fillRect(G.W / 2 - 260, y - 26, 520, 34);
    }
    ctx.font = (sel ? 'bold ' : '') + '20px ' + FONT;
    ctx.fillStyle = sel ? '#ffe36e' : '#9aa2c0';
    ctx.fillText((sel ? '▸ ' : '  ') + entries[i], G.W / 2, y);
  }

  ctx.font = '13px ' + FONT;
  ctx.fillStyle = 'rgba(160,170,200,0.75)';
  ctx.fillText('WASD drive/walk · SPACE attack/handbrake · F enter/jack · Q weapon · ESC pause', G.W / 2, G.H - 60);
  ctx.fillText('make.fun gta6-01 — Vice Palms', G.W / 2, G.H - 36);
  // palm silhouette beat
  drawTitlePalms(ctx);
}

function drawTitlePalms(ctx) {
  ctx.save();
  ctx.strokeStyle = 'rgba(20,26,48,0.9)';
  ctx.lineWidth = 10;
  for (const [x, h] of [[110, 90], [1170, 110], [180, 60], [1100, 70]]) {
    const baseY = G.H - 8;
    ctx.beginPath();
    ctx.moveTo(x, baseY);
    ctx.quadraticCurveTo(x + 8, baseY - h * 0.6, x + 16, baseY - h);
    ctx.stroke();
  }
  ctx.restore();
}

function dim(ctx, a) {
  ctx.fillStyle = 'rgba(4,5,16,' + a + ')';
  ctx.fillRect(0, 0, G.W, G.H);
}

function drawPause(ctx) {
  dim(ctx, 0.6);
  neonTitle(ctx, 'PAUSED', G.W / 2, 200, 48, '#3ae7ff');
  const entries = ['RESUME', 'SAVE GAME', 'DELETE SAVE', 'QUIT TO TITLE'];
  ctx.textAlign = 'center';
  for (let i = 0; i < entries.length; i++) {
    const y = 300 + i * 46;
    const sel = i === menuIdx;
    ctx.font = (sel ? 'bold ' : '') + '20px ' + FONT;
    ctx.fillStyle = sel ? '#ffe36e' : '#9aa2c0';
    ctx.fillText((sel ? '▸ ' : '  ') + entries[i], G.W / 2, y);
  }
}

function drawWastedBusted(ctx, word, col, sub) {
  dim(ctx, 0.45 + 0.2 * Math.min(1, G.screenT));
  const a = Math.min(1, G.screenT * 2);
  ctx.save();
  ctx.globalAlpha = a;
  neonTitle(ctx, word, G.W / 2, G.H / 2 - 10, 88, col);
  ctx.font = '18px ' + FONT;
  ctx.textAlign = 'center';
  ctx.fillStyle = '#dfe6ee';
  ctx.fillText(sub, G.W / 2, G.H / 2 + 40);
  ctx.restore();
}

function drawEnd(ctx) {
  dim(ctx, 0.72);
  neonTitle(ctx, 'VICE PALMS', G.W / 2, 200, 64, '#ff4fa3');
  ctx.textAlign = 'center';
  ctx.font = '17px ' + FONT;
  ctx.fillStyle = '#dfe6ee';
  const lines = [
    'Rico Ferrara and Junior hold the coast,',
    'the docks run clean, the neon never sleeps.',
    '',
    'Missions done: ' + G.stats.missionsDone + '/6   Cars jacked: ' + G.stats.carjacks,
    'Earned: ' + fmtMoney(G.stats.earned) + '   Pedestrians inconvenienced: ' + G.stats.kills,
    '',
    'The palms keep their secrets.',
  ];
  lines.forEach((l, i) => ctx.fillText(l, G.W / 2, 300 + i * 30));
  ctx.font = 'bold 16px ' + FONT;
  ctx.fillStyle = '#ffe36e';
  ctx.fillText('ENTER — back to free roam', G.W / 2, G.H - 70);
}
