// screens.js — title, pause, controls, WASTED/BUSTED, mission passed, finale.
// localStorage save/load lives here too.

import { CFG } from './config.js';
import { fmtMoney, TAU } from './util.js';
import { saveGame, loadGame, deleteSave, hasSave } from './save.js';

export function updateTitle(g) {
  const input = g.input;
  const items = menuItems(g);
  if (input.took('w') || input.took('ArrowUp')) g.menuIdx = (g.menuIdx + items.length - 1) % items.length;
  if (input.took('s') || input.took('ArrowDown')) g.menuIdx = (g.menuIdx + 1) % items.length;
  if (input.took('Enter') || input.took(' ')) activate(g, items[g.menuIdx]);
  if (input.took('m')) g.audio.toggle();
}

function menuItems(g) {
  const items = ['new', 'controls'];
  if (hasSave()) items.unshift('continue');
  items.push('mute');
  return items;
}

function label(g, it) {
  switch (it) {
    case 'continue': return 'CONTINUE';
    case 'new': return 'NEW GAME';
    case 'controls': return 'CONTROLS';
    case 'mute': return 'MUTE: ' + (g.audio.muted ? 'ON' : 'OFF');
    default: return it;
  }
}

function activate(g, it) {
  if (it === 'new') g.hooks.newGame();
  else if (it === 'continue') g.hooks.continueGame();
  else if (it === 'controls') g.state = 'controls';
  else if (it === 'mute') g.audio.toggle();
}

export function drawTitle(g, ctx) {
  const t = g.time;
  const items = menuItems(g);
  g.menuIdx = Math.min(g.menuIdx, items.length - 1);

  // backdrop: deep gradient + palms silhouette
  const grad = ctx.createLinearGradient(0, 0, 0, CFG.VIEW_H);
  grad.addColorStop(0, '#0a0e28');
  grad.addColorStop(0.55, '#1a1038');
  grad.addColorStop(1, '#38123c');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, CFG.VIEW_W, CFG.VIEW_H);
  // sun disc
  ctx.fillStyle = 'rgba(255,110,60,0.22)';
  ctx.beginPath();
  ctx.arc(CFG.VIEW_W / 2, 470, 210, 0, TAU);
  ctx.fill();
  // palm silhouettes
  palm(ctx, 160, 620, 1.3);
  palm(ctx, 1120, 640, 1.1);
  palm(ctx, 1010, 660, 0.8);

  // neon title
  ctx.textAlign = 'center';
  ctx.save();
  ctx.font = 'bold 92px "Arial Black", sans-serif';
  ctx.shadowColor = '#ff2d78';
  ctx.shadowBlur = 26;
  ctx.fillStyle = '#ffd7ea';
  ctx.fillText('VICE', CFG.VIEW_W / 2, 218);
  ctx.shadowColor = '#00e5ff';
  ctx.fillStyle = '#d7f6ff';
  ctx.fillText('PALMS', CFG.VIEW_W / 2, 318);
  ctx.restore();
  ctx.font = '17px monospace';
  ctx.fillStyle = '#9aa4c8';
  ctx.fillText('Rico returns to Vice Palms — a night-drive fable', CFG.VIEW_W / 2, 360);

  // menu
  let y = 440;
  items.forEach((it, i) => {
    const sel = i === g.menuIdx;
    ctx.font = 'bold 26px monospace';
    ctx.fillStyle = sel ? '#ffd24a' : '#c8ccda';
    if (sel) {
      ctx.shadowColor = '#ffd24a';
      ctx.shadowBlur = 12;
      ctx.fillText((sel ? '> ' : '') + label(g, it), CFG.VIEW_W / 2, y);
      ctx.shadowBlur = 0;
    } else {
      ctx.fillText('  ' + label(g, it), CFG.VIEW_W / 2, y);
    }
    y += 46;
  });

  ctx.font = '13px monospace';
  ctx.fillStyle = '#7d84a0';
  ctx.fillText('W/S select · ENTER confirm · M mute', CFG.VIEW_W / 2, y + 14);
  ctx.textAlign = 'left';
}

function palm(ctx, x, y, s) {
  ctx.strokeStyle = '#12081c';
  ctx.lineWidth = 10 * s;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.quadraticCurveTo(x + 8 * s, y - 60 * s, x + 22 * s, y - 108 * s);
  ctx.stroke();
  ctx.lineWidth = 6 * s;
  for (let i = 0; i < 6; i++) {
    const a = -Math.PI * 0.95 + (i / 5) * Math.PI * 0.9;
    ctx.beginPath();
    ctx.moveTo(x + 22 * s, y - 108 * s);
    ctx.quadraticCurveTo(
      x + 22 * s + Math.cos(a) * 46 * s, y - 108 * s + Math.sin(a) * 30 * s,
      x + 22 * s + Math.cos(a) * 78 * s, y - 108 * s + Math.sin(a) * 6 * s + 26 * s
    );
    ctx.stroke();
  }
}

// ------------------------------------------------------------------ pause

export function updatePause(g) {
  const input = g.input;
  const items = ['resume', 'save', 'controls', 'title'];
  if (input.took('w') || input.took('ArrowUp')) g.pauseIdx = (g.pauseIdx + items.length - 1) % items.length;
  if (input.took('s') || input.took('ArrowDown')) g.pauseIdx = (g.pauseIdx + 1) % items.length;
  if (input.took('Escape')) { g.state = 'play'; return; }
  if (input.took('Enter')) {
    const it = items[g.pauseIdx];
    if (it === 'resume') g.state = 'play';
    else if (it === 'save') {
      saveGame(g);
      g.toasts.push({ text: 'Game saved.', t: 2, col: '#8fdc8f' });
      g.state = 'play';
    } else if (it === 'controls') g.state = 'controls';
    else if (it === 'title') g.hooks.toTitle();
  }
}

export function drawPause(g, ctx) {
  ctx.fillStyle = 'rgba(6,8,18,0.72)';
  ctx.fillRect(0, 0, CFG.VIEW_W, CFG.VIEW_H);
  ctx.textAlign = 'center';
  ctx.font = 'bold 52px "Arial Black", sans-serif';
  ctx.fillStyle = '#8fd0ff';
  ctx.fillText('PAUSED', CFG.VIEW_W / 2, 200);
  const items = ['resume', 'save', 'controls', 'title'];
  const labels = { resume: 'RESUME', save: 'SAVE GAME', controls: 'CONTROLS', title: 'QUIT TO TITLE' };
  let y = 300;
  items.forEach((it, i) => {
    const sel = i === g.pauseIdx;
    ctx.font = 'bold 24px monospace';
    ctx.fillStyle = sel ? '#ffd24a' : '#c8ccda';
    ctx.fillText((sel ? '> ' : '  ') + labels[it], CFG.VIEW_W / 2, y);
    y += 46;
  });
  ctx.textAlign = 'left';
}

// ------------------------------------------------------------------ controls

export function updateControls(g) {
  const input = g.input;
  if (input.took('Enter') || input.took('Escape') || input.took(' ')) {
    g.state = g.prevState || 'title';
  }
}

export function drawControls(g, ctx) {
  ctx.fillStyle = 'rgba(6,8,18,0.85)';
  ctx.fillRect(0, 0, CFG.VIEW_W, CFG.VIEW_H);
  ctx.textAlign = 'center';
  ctx.font = 'bold 40px "Arial Black", sans-serif';
  ctx.fillStyle = '#ffd24a';
  ctx.fillText('CONTROLS', CFG.VIEW_W / 2, 120);
  const rows = [
    ['W A S D / arrows', 'walk · drive'],
    ['SHIFT', 'sprint'],
    ['F', 'enter / exit / jack a car'],
    ['LEFT MOUSE / CTRL', 'punch · shoot (aim with mouse)'],
    ['SPACE', 'handbrake'],
    ['H', 'horn'],
    ['ESC', 'pause'],
    ['M', 'mute'],
  ];
  let y = 190;
  ctx.font = '18px monospace';
  for (const [k, v] of rows) {
    ctx.fillStyle = '#8fd0ff';
    ctx.textAlign = 'right';
    ctx.fillText(k, 610, y);
    ctx.fillStyle = '#e6e8f0';
    ctx.textAlign = 'left';
    ctx.fillText(v, 660, y);
    y += 42;
  }
  ctx.textAlign = 'center';
  ctx.font = '14px monospace';
  ctx.fillStyle = '#7d84a0';
  ctx.fillText('ENTER to go back', CFG.VIEW_W / 2, y + 30);
  ctx.textAlign = 'left';
}

// ------------------------------------------------------------------ overlays

export function drawOverlays(g, ctx) {
  // wasted / busted
  if (g.state === 'wasted' || g.state === 'busted') {
    ctx.fillStyle = g.state === 'wasted' ? 'rgba(40,4,8,0.6)' : 'rgba(4,10,40,0.6)';
    ctx.fillRect(0, 0, CFG.VIEW_W, CFG.VIEW_H);
    ctx.textAlign = 'center';
    ctx.font = 'bold 84px "Arial Black", sans-serif';
    ctx.shadowColor = g.state === 'wasted' ? '#ff2038' : '#4078ff';
    ctx.shadowBlur = 24;
    ctx.fillStyle = g.state === 'wasted' ? '#ff8a96' : '#9ac0ff';
    ctx.fillText(g.state === 'wasted' ? 'WASTED' : 'BUSTED', CFG.VIEW_W / 2, CFG.VIEW_H / 2 - 20);
    ctx.shadowBlur = 0;
    ctx.font = '18px monospace';
    ctx.fillStyle = '#e6e8f0';
    const fee = g.state === 'wasted' ? CFG.RESPAWN_HOSPITAL_FEE : CFG.RESPAWN_BUSTED_FEE;
    ctx.fillText(`The palms take their cut: -${fmtMoney(fee)}`, CFG.VIEW_W / 2, CFG.VIEW_H / 2 + 26);
    ctx.textAlign = 'left';
  }
  // mission passed / failed
  if (g.passedOverlay && g.passedOverlay.t > 0) {
    const o = g.passedOverlay;
    const a = clamp01(o.t / 0.4);
    ctx.fillStyle = `rgba(6,8,16,${0.55 * a})`;
    ctx.fillRect(0, CFG.VIEW_H / 2 - 90, CFG.VIEW_W, 180);
    ctx.textAlign = 'center';
    ctx.globalAlpha = a;
    ctx.font = 'bold 64px "Arial Black", sans-serif';
    ctx.shadowColor = o.col;
    ctx.shadowBlur = 22;
    ctx.fillStyle = o.col;
    ctx.fillText(o.text, CFG.VIEW_W / 2, CFG.VIEW_H / 2 - 8);
    ctx.shadowBlur = 0;
    if (o.sub) {
      ctx.font = 'bold 30px monospace';
      ctx.fillStyle = '#e6e8f0';
      ctx.fillText(o.sub, CFG.VIEW_W / 2, CFG.VIEW_H / 2 + 44);
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = 'left';
  }
}

function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

// ------------------------------------------------------------------ finale

export function drawFinale(g, ctx) {
  ctx.fillStyle = 'rgba(6,8,18,0.88)';
  ctx.fillRect(0, 0, CFG.VIEW_W, CFG.VIEW_H);
  ctx.textAlign = 'center';
  ctx.font = 'bold 74px "Arial Black", sans-serif';
  ctx.shadowColor = '#ffd24a';
  ctx.shadowBlur = 24;
  ctx.fillStyle = '#ffd24a';
  ctx.fillText('THE END', CFG.VIEW_W / 2, 220);
  ctx.shadowBlur = 0;
  ctx.font = '20px monospace';
  ctx.fillStyle = '#e6e8f0';
  ctx.fillText('Rico rules Vice Palms again. The Ferrettis sleep with the fishes.', CFG.VIEW_W / 2, 290);
  const S = g.missions.stats;
  ctx.font = '17px monospace';
  ctx.fillStyle = '#9aa4c8';
  const lines = [
    `missions passed: ${S.passed}   failed: ${S.failed}`,
    `money earned: ${fmtMoney(S.earned)}   bank: ${fmtMoney(g.player.money)}`,
    `cars jacked: ${S.jacks}   pedestrians flattened: ${S.kills}`,
  ];
  let y = 350;
  for (const l of lines) {
    ctx.fillText(l, CFG.VIEW_W / 2, y);
    y += 34;
  }
  ctx.font = '15px monospace';
  ctx.fillStyle = '#7d84a0';
  ctx.fillText('ENTER — back to the title', CFG.VIEW_W / 2, y + 40);
  ctx.textAlign = 'left';
  const input = g.input;
  if (input.took('Enter')) g.hooks.toTitle();
}

export { deleteSave, loadGame, saveGame };
